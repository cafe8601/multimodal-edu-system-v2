import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../infrastructure/logging/logger';
import { AgentMessage, MessageType, CircuitBreakerState, CircuitBreakerConfig } from '../core/types';

/**
 * Message bus for inter-agent communication
 * Handles pub/sub messaging, routing, and reliability features
 */
export class MessageBus extends EventEmitter {
    private readonly publisher: Redis;
    private readonly subscriber: Redis;
    private readonly logger: Logger;
    private readonly channelPrefix = 'agents:messages';
    private readonly subscriptions: Map<string, Set<string>> = new Map();
    private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();
    private readonly messageQueue: Map<string, AgentMessage[]> = new Map();
    private isShutdown = false;

    constructor(redis: Redis, logger?: Logger) {
        super();
        this.publisher = redis;
        this.subscriber = redis.duplicate();
        this.logger = logger || new Logger('MessageBus');
        
        this.setupSubscriber();
    }

    /**
     * Send message to a specific agent
     */
    public async sendMessage(message: AgentMessage): Promise<void> {
        try {
            if (this.isShutdown) {
                throw new Error('MessageBus is shutdown');
            }

            // Check circuit breaker for target agent
            if (this.isCircuitBreakerOpen(message.to)) {
                throw new Error(`Circuit breaker is open for agent: ${message.to}`);
            }

            // Add metadata
            message.timestamp = new Date();
            message.id = message.id || this.generateMessageId();

            const channel = this.getChannelName(message.to);
            const messageData = JSON.stringify(message);

            // Handle TTL
            if (message.ttl) {
                // Store message with TTL for later delivery if agent is offline
                await this.publisher.setex(
                    `${this.channelPrefix}:pending:${message.to}:${message.id}`,
                    Math.floor(message.ttl / 1000),
                    messageData
                );
            }

            // Publish message
            await this.publisher.publish(channel, messageData);

            this.logger.debug(`Message sent from ${message.from} to ${message.to}`);
            this.emit('messageSent', message);

        } catch (error) {
            this.logger.error(`Failed to send message:`, error);
            this.handleCircuitBreaker(message.to, false);
            throw error;
        }
    }

    /**
     * Broadcast message to all agents
     */
    public async broadcastMessage(message: AgentMessage): Promise<void> {
        try {
            message.to = 'broadcast';
            message.timestamp = new Date();
            message.id = message.id || this.generateMessageId();

            const channel = this.getChannelName('broadcast');
            const messageData = JSON.stringify(message);

            await this.publisher.publish(channel, messageData);

            this.logger.debug(`Broadcast message sent from ${message.from}`);
            this.emit('messageBroadcast', message);

        } catch (error) {
            this.logger.error(`Failed to broadcast message:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to messages for an agent
     */
    public async subscribe(agentId: string, messageTypes?: MessageType[]): Promise<void> {
        try {
            const channel = this.getChannelName(agentId);
            
            // Track subscription
            if (!this.subscriptions.has(channel)) {
                this.subscriptions.set(channel, new Set());
                await this.subscriber.subscribe(channel);
            }

            if (messageTypes) {
                messageTypes.forEach(type => {
                    this.subscriptions.get(channel)!.add(type);
                });
            }

            // Also subscribe to broadcast messages
            const broadcastChannel = this.getChannelName('broadcast');
            if (!this.subscriptions.has(broadcastChannel)) {
                this.subscriptions.set(broadcastChannel, new Set());
                await this.subscriber.subscribe(broadcastChannel);
            }

            // Deliver any pending messages
            await this.deliverPendingMessages(agentId);

            this.logger.info(`Agent ${agentId} subscribed to messages`);
            this.emit('subscribed', agentId);

        } catch (error) {
            this.logger.error(`Failed to subscribe agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Unsubscribe agent from messages
     */
    public async unsubscribe(agentId: string): Promise<void> {
        try {
            const channel = this.getChannelName(agentId);
            
            if (this.subscriptions.has(channel)) {
                this.subscriptions.delete(channel);
                await this.subscriber.unsubscribe(channel);
            }

            this.logger.info(`Agent ${agentId} unsubscribed from messages`);
            this.emit('unsubscribed', agentId);

        } catch (error) {
            this.logger.error(`Failed to unsubscribe agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Send request and wait for response
     */
    public async sendRequest(
        message: AgentMessage, 
        timeoutMs: number = 30000
    ): Promise<AgentMessage> {
        
        return new Promise(async (resolve, reject) => {
            try {
                const correlationId = this.generateMessageId();
                message.correlationId = correlationId;
                message.replyTo = message.from;

                // Set up response listener
                const responseListener = (responseMessage: AgentMessage) => {
                    if (responseMessage.correlationId === correlationId) {
                        clearTimeout(timeoutHandle);
                        this.off('messageReceived', responseListener);
                        resolve(responseMessage);
                    }
                };

                const timeoutHandle = setTimeout(() => {
                    this.off('messageReceived', responseListener);
                    reject(new Error(`Request timeout after ${timeoutMs}ms`));
                }, timeoutMs);

                this.on('messageReceived', responseListener);
                await this.sendMessage(message);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Send response to a request
     */
    public async sendResponse(
        originalMessage: AgentMessage,
        responseData: any,
        fromAgentId: string
    ): Promise<void> {
        
        if (!originalMessage.replyTo || !originalMessage.correlationId) {
            throw new Error('Cannot send response to message without replyTo or correlationId');
        }

        const response: AgentMessage = {
            id: this.generateMessageId(),
            type: MessageType.TASK_RESPONSE,
            from: fromAgentId,
            to: originalMessage.replyTo,
            payload: responseData,
            correlationId: originalMessage.correlationId,
            timestamp: new Date()
        };

        await this.sendMessage(response);
    }

    /**
     * Get message statistics
     */
    public async getStats(): Promise<{
        activeSubscriptions: number;
        pendingMessages: number;
        circuitBreakers: Record<string, CircuitBreakerState>;
    }> {
        
        try {
            let pendingCount = 0;
            const pattern = `${this.channelPrefix}:pending:*`;
            const keys = await this.publisher.keys(pattern);
            pendingCount = keys.length;

            return {
                activeSubscriptions: this.subscriptions.size,
                pendingMessages: pendingCount,
                circuitBreakers: Object.fromEntries(this.circuitBreakers)
            };

        } catch (error) {
            this.logger.error('Failed to get message bus stats:', error);
            throw error;
        }
    }

    /**
     * Configure circuit breaker for an agent
     */
    public configureCircuitBreaker(agentId: string, config: CircuitBreakerConfig): void {
        // Implementation would track failure rates and configure circuit breaker
        this.logger.info(`Circuit breaker configured for agent ${agentId}`);
    }

    /**
     * Shutdown message bus
     */
    public async shutdown(): Promise<void> {
        try {
            this.isShutdown = true;
            
            // Unsubscribe from all channels
            for (const channel of this.subscriptions.keys()) {
                await this.subscriber.unsubscribe(channel);
            }
            
            this.subscriptions.clear();
            this.circuitBreakers.clear();
            this.messageQueue.clear();
            
            await this.subscriber.quit();
            await this.publisher.quit();
            
            this.removeAllListeners();
            this.logger.info('MessageBus shut down');

        } catch (error) {
            this.logger.error('Error during MessageBus shutdown:', error);
            throw error;
        }
    }

    // Private methods
    private setupSubscriber(): void {
        this.subscriber.on('message', async (channel: string, message: string) => {
            try {
                const agentMessage: AgentMessage = JSON.parse(message);
                
                // Validate message
                if (!this.validateMessage(agentMessage)) {
                    this.logger.warn('Received invalid message:', agentMessage);
                    return;
                }

                this.logger.debug(`Message received on channel ${channel}:`, agentMessage.type);
                this.emit('messageReceived', agentMessage);
                this.emit(`message:${agentMessage.type}`, agentMessage);

                // Handle circuit breaker success
                this.handleCircuitBreaker(agentMessage.from, true);

            } catch (error) {
                this.logger.error(`Failed to process received message:`, error);
            }
        });

        this.subscriber.on('error', (error) => {
            this.logger.error('Redis subscriber error:', error);
            this.emit('error', error);
        });
    }

    private getChannelName(target: string): string {
        return `${this.channelPrefix}:${target}`;
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private validateMessage(message: AgentMessage): boolean {
        return !!(message.id && message.type && message.from && message.to && message.payload !== undefined);
    }

    private async deliverPendingMessages(agentId: string): Promise<void> {
        try {
            const pattern = `${this.channelPrefix}:pending:${agentId}:*`;
            const keys = await this.publisher.keys(pattern);

            for (const key of keys) {
                const messageData = await this.publisher.get(key);
                if (messageData) {
                    const message: AgentMessage = JSON.parse(messageData);
                    this.emit('messageReceived', message);
                    
                    // Remove pending message
                    await this.publisher.del(key);
                }
            }

        } catch (error) {
            this.logger.error(`Failed to deliver pending messages for ${agentId}:`, error);
        }
    }

    private isCircuitBreakerOpen(agentId: string): boolean {
        const state = this.circuitBreakers.get(agentId);
        return state === CircuitBreakerState.OPEN;
    }

    private handleCircuitBreaker(agentId: string, success: boolean): void {
        const currentState = this.circuitBreakers.get(agentId) || CircuitBreakerState.CLOSED;
        
        if (success) {
            if (currentState === CircuitBreakerState.HALF_OPEN) {
                this.circuitBreakers.set(agentId, CircuitBreakerState.CLOSED);
            }
        } else {
            if (currentState === CircuitBreakerState.CLOSED) {
                this.circuitBreakers.set(agentId, CircuitBreakerState.OPEN);
                
                // Auto-recovery after timeout
                setTimeout(() => {
                    this.circuitBreakers.set(agentId, CircuitBreakerState.HALF_OPEN);
                }, 60000); // 60 second recovery timeout
            }
        }
    }
}

export default MessageBus;