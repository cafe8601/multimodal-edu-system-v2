import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../infrastructure/logging/logger';

/**
 * Event system for agent notifications and system-wide events
 */
export interface SystemEvent {
    id: string;
    type: string;
    source: string;
    target?: string;
    payload: any;
    timestamp: Date;
    ttl?: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
    correlationId?: string;
    metadata?: Record<string, any>;
}

export enum EventType {
    AGENT_STARTED = 'agent.started',
    AGENT_STOPPED = 'agent.stopped',
    AGENT_ERROR = 'agent.error',
    AGENT_HEALTH_CHECK = 'agent.health_check',
    TASK_ASSIGNED = 'task.assigned',
    TASK_COMPLETED = 'task.completed',
    TASK_FAILED = 'task.failed',
    SYSTEM_ALERT = 'system.alert',
    PERFORMANCE_WARNING = 'performance.warning',
    RESOURCE_EXHAUSTION = 'resource.exhaustion',
    SECURITY_ALERT = 'security.alert',
    CONFIGURATION_CHANGED = 'configuration.changed'
}

export class EventSystem extends EventEmitter {
    private readonly redis: Redis;
    private readonly publisher: Redis;
    private readonly subscriber: Redis;
    private readonly logger: Logger;
    private readonly eventStore = 'events:store';
    private readonly eventStreams = 'events:streams';
    private readonly subscriptions: Map<string, Set<string>> = new Map();
    private readonly eventHandlers: Map<string, Function[]> = new Map();
    private isShutdown = false;

    constructor(redis: Redis, logger?: Logger) {
        super();
        this.redis = redis;
        this.publisher = redis.duplicate();
        this.subscriber = redis.duplicate();
        this.logger = logger || new Logger('EventSystem');
        
        this.setupSubscriber();
        this.startEventCleanup();
    }

    /**
     * Publish a system event
     */
    public async publishEvent(event: SystemEvent): Promise<void> {
        try {
            if (this.isShutdown) {
                throw new Error('EventSystem is shutdown');
            }

            event.id = event.id || this.generateEventId();
            event.timestamp = new Date();

            // Store event for persistence
            await this.storeEvent(event);

            // Publish to real-time subscribers
            const channel = this.getEventChannel(event.type);
            await this.publisher.publish(channel, JSON.stringify(event));

            // Publish to wildcard subscribers
            const wildcardChannel = this.getEventChannel('*');
            await this.publisher.publish(wildcardChannel, JSON.stringify(event));

            this.logger.debug(`Event published: ${event.type} from ${event.source}`);
            this.emit('eventPublished', event);

        } catch (error) {
            this.logger.error(`Failed to publish event:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to specific event types
     */
    public async subscribeToEvents(
        subscriber: string,
        eventTypes: string[],
        handler: (event: SystemEvent) => void
    ): Promise<void> {
        
        try {
            for (const eventType of eventTypes) {
                const channel = this.getEventChannel(eventType);
                
                // Track subscription
                if (!this.subscriptions.has(channel)) {
                    this.subscriptions.set(channel, new Set());
                    await this.subscriber.subscribe(channel);
                }
                
                this.subscriptions.get(channel)!.add(subscriber);

                // Track handler
                if (!this.eventHandlers.has(eventType)) {
                    this.eventHandlers.set(eventType, []);
                }
                this.eventHandlers.get(eventType)!.push(handler);
            }

            this.logger.info(`Subscriber ${subscriber} registered for events: ${eventTypes.join(', ')}`);

        } catch (error) {
            this.logger.error(`Failed to subscribe to events:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to all events (wildcard subscription)
     */
    public async subscribeToAllEvents(
        subscriber: string,
        handler: (event: SystemEvent) => void
    ): Promise<void> {
        
        try {
            const channel = this.getEventChannel('*');
            
            if (!this.subscriptions.has(channel)) {
                this.subscriptions.set(channel, new Set());
                await this.subscriber.subscribe(channel);
            }
            
            this.subscriptions.get(channel)!.add(subscriber);

            // Track wildcard handler
            if (!this.eventHandlers.has('*')) {
                this.eventHandlers.set('*', []);
            }
            this.eventHandlers.get('*')!.push(handler);

            this.logger.info(`Subscriber ${subscriber} registered for all events`);

        } catch (error) {
            this.logger.error(`Failed to subscribe to all events:`, error);
            throw error;
        }
    }

    /**
     * Unsubscribe from events
     */
    public async unsubscribeFromEvents(subscriber: string, eventTypes?: string[]): Promise<void> {
        try {
            const typesToUnsubscribe = eventTypes || ['*'];

            for (const eventType of typesToUnsubscribe) {
                const channel = this.getEventChannel(eventType);
                
                if (this.subscriptions.has(channel)) {
                    this.subscriptions.get(channel)!.delete(subscriber);
                    
                    // If no more subscribers, unsubscribe from Redis
                    if (this.subscriptions.get(channel)!.size === 0) {
                        this.subscriptions.delete(channel);
                        await this.subscriber.unsubscribe(channel);
                    }
                }

                // Remove handlers (simplified - in production, you'd track handler-subscriber pairs)
                if (this.eventHandlers.has(eventType)) {
                    this.eventHandlers.delete(eventType);
                }
            }

            this.logger.info(`Subscriber ${subscriber} unsubscribed from events`);

        } catch (error) {
            this.logger.error(`Failed to unsubscribe from events:`, error);
            throw error;
        }
    }

    /**
     * Query historical events
     */
    public async queryEvents(criteria: {
        type?: string;
        source?: string;
        startTime?: Date;
        endTime?: Date;
        limit?: number;
    }): Promise<SystemEvent[]> {
        
        try {
            const events: SystemEvent[] = [];
            const limit = criteria.limit || 100;
            
            // Get events from Redis sorted set (simplified query)
            const eventKeys = await this.redis.zrevrange(
                this.eventStore,
                0,
                limit - 1,
                'WITHSCORES'
            );

            for (let i = 0; i < eventKeys.length; i += 2) {
                const eventData = await this.redis.hget(`${this.eventStore}:data`, eventKeys[i]);
                if (eventData) {
                    const event: SystemEvent = JSON.parse(eventData);
                    
                    // Apply filters
                    if (criteria.type && event.type !== criteria.type) continue;
                    if (criteria.source && event.source !== criteria.source) continue;
                    if (criteria.startTime && event.timestamp < criteria.startTime) continue;
                    if (criteria.endTime && event.timestamp > criteria.endTime) continue;
                    
                    events.push(event);
                }
            }

            return events.slice(0, limit);

        } catch (error) {
            this.logger.error('Failed to query events:', error);
            throw error;
        }
    }

    /**
     * Get event statistics
     */
    public async getEventStats(): Promise<{
        totalEvents: number;
        eventsByType: Record<string, number>;
        eventsByPriority: Record<string, number>;
        recentEvents: number;
        activeSubscriptions: number;
    }> {
        
        try {
            const totalEvents = await this.redis.zcard(this.eventStore);
            const activeSubscriptions = this.subscriptions.size;
            
            // Get recent events (last hour)
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            const recentEvents = await this.redis.zcount(this.eventStore, oneHourAgo, '+inf');
            
            // Simplified stats - in production, you'd track these separately
            const stats = {
                totalEvents,
                eventsByType: {} as Record<string, number>,
                eventsByPriority: {} as Record<string, number>,
                recentEvents,
                activeSubscriptions
            };

            return stats;

        } catch (error) {
            this.logger.error('Failed to get event stats:', error);
            throw error;
        }
    }

    /**
     * Create event stream for real-time processing
     */
    public async createEventStream(
        streamName: string,
        eventTypes: string[]
    ): Promise<void> {
        
        try {
            const streamKey = `${this.eventStreams}:${streamName}`;
            
            // Subscribe to specified event types and forward to stream
            await this.subscribeToEvents(streamName, eventTypes, async (event) => {
                await this.redis.xadd(streamKey, '*', 'event', JSON.stringify(event));
            });

            this.logger.info(`Event stream '${streamName}' created for types: ${eventTypes.join(', ')}`);

        } catch (error) {
            this.logger.error(`Failed to create event stream:`, error);
            throw error;
        }
    }

    /**
     * Process events from stream
     */
    public async processEventStream(
        streamName: string,
        consumerGroup: string,
        consumer: string,
        processor: (event: SystemEvent) => Promise<void>
    ): Promise<void> {
        
        try {
            const streamKey = `${this.eventStreams}:${streamName}`;
            
            // Create consumer group if it doesn't exist
            try {
                await this.redis.xgroup('CREATE', streamKey, consumerGroup, '$', 'MKSTREAM');
            } catch (error) {
                // Group might already exist
            }

            // Process events from stream
            const events = await this.redis.xreadgroup(
                'GROUP', consumerGroup, consumer,
                'COUNT', 10,
                'BLOCK', 1000,
                'STREAMS', streamKey, '>'
            );

            if (events && events.length > 0) {
                for (const [stream, messages] of events) {
                    for (const [id, fields] of messages) {
                        try {
                            const eventData = fields[1]; // 'event' field value
                            const event: SystemEvent = JSON.parse(eventData);
                            
                            await processor(event);
                            
                            // Acknowledge processing
                            await this.redis.xack(streamKey, consumerGroup, id);
                            
                        } catch (processingError) {
                            this.logger.error(`Failed to process event ${id}:`, processingError);
                        }
                    }
                }
            }

        } catch (error) {
            this.logger.error('Failed to process event stream:', error);
            throw error;
        }
    }

    /**
     * Shutdown event system
     */
    public async shutdown(): Promise<void> {
        try {
            this.isShutdown = true;
            
            // Unsubscribe from all channels
            for (const channel of this.subscriptions.keys()) {
                await this.subscriber.unsubscribe(channel);
            }
            
            this.subscriptions.clear();
            this.eventHandlers.clear();
            
            await this.subscriber.quit();
            await this.publisher.quit();
            
            this.removeAllListeners();
            this.logger.info('EventSystem shut down');

        } catch (error) {
            this.logger.error('Error during EventSystem shutdown:', error);
            throw error;
        }
    }

    // Private methods
    private setupSubscriber(): void {
        this.subscriber.on('message', async (channel: string, message: string) => {
            try {
                const event: SystemEvent = JSON.parse(message);
                
                this.logger.debug(`Event received on channel ${channel}:`, event.type);
                this.emit('eventReceived', event);

                // Call registered handlers
                const eventType = this.getEventTypeFromChannel(channel);
                const handlers = this.eventHandlers.get(eventType) || [];
                const wildcardHandlers = this.eventHandlers.get('*') || [];

                for (const handler of [...handlers, ...wildcardHandlers]) {
                    try {
                        await handler(event);
                    } catch (handlerError) {
                        this.logger.error(`Event handler error:`, handlerError);
                    }
                }

            } catch (error) {
                this.logger.error(`Failed to process received event:`, error);
            }
        });

        this.subscriber.on('error', (error) => {
            this.logger.error('Redis subscriber error:', error);
            this.emit('error', error);
        });
    }

    private async storeEvent(event: SystemEvent): Promise<void> {
        try {
            const score = event.timestamp.getTime();
            
            // Add to sorted set by timestamp
            await this.redis.zadd(this.eventStore, score, event.id);
            
            // Store event data
            await this.redis.hset(`${this.eventStore}:data`, event.id, JSON.stringify(event));
            
            // Set TTL for event data (7 days)
            await this.redis.expire(`${this.eventStore}:data:${event.id}`, 7 * 24 * 60 * 60);

        } catch (error) {
            this.logger.error('Failed to store event:', error);
        }
    }

    private getEventChannel(eventType: string): string {
        return `events:${eventType}`;
    }

    private getEventTypeFromChannel(channel: string): string {
        return channel.replace('events:', '');
    }

    private generateEventId(): string {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private startEventCleanup(): void {
        // Clean up old events every hour
        setInterval(async () => {
            if (!this.isShutdown) {
                await this.cleanupOldEvents();
            }
        }, 60 * 60 * 1000);
    }

    private async cleanupOldEvents(): Promise<void> {
        try {
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            // Remove old events
            const removedCount = await this.redis.zremrangebyscore(this.eventStore, '-inf', oneWeekAgo);
            
            if (removedCount > 0) {
                this.logger.info(`Cleaned up ${removedCount} old events`);
            }

        } catch (error) {
            this.logger.error('Failed to cleanup old events:', error);
        }
    }
}

export default EventSystem;