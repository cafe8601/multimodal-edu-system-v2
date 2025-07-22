import { Logger } from '../../infrastructure/logging/logger';
import { AgentRegistry } from '../core/AgentRegistry';
import { TaskQueue } from '../core/TaskQueue';
import { MessageBus } from './MessageBus';
import { 
    TaskRequest, 
    TaskResult, 
    AgentCapability, 
    LoadBalancingStrategy,
    AgentMessage,
    MessageType
} from '../core/types';

/**
 * Request router for distributing requests to appropriate agents
 * Handles load balancing, fallback routing, and request optimization
 */
export class RequestRouter {
    private readonly agentRegistry: AgentRegistry;
    private readonly taskQueue: TaskQueue;
    private readonly messageBus: MessageBus;
    private readonly logger: Logger;
    
    // Routing statistics
    private routingStats = {
        totalRequests: 0,
        successfulRoutes: 0,
        failedRoutes: 0,
        averageResponseTime: 0,
        routingsByStrategy: new Map<LoadBalancingStrategy, number>()
    };

    constructor(
        agentRegistry: AgentRegistry,
        taskQueue: TaskQueue,
        messageBus: MessageBus,
        logger?: Logger
    ) {
        this.agentRegistry = agentRegistry;
        this.taskQueue = taskQueue;
        this.messageBus = messageBus;
        this.logger = logger || new Logger('RequestRouter');
    }

    /**
     * Route a task request to the best available agent
     */
    public async routeTask(
        request: TaskRequest,
        strategy: LoadBalancingStrategy = LoadBalancingStrategy.CAPABILITY_MATCH,
        fallbackStrategy?: LoadBalancingStrategy
    ): Promise<TaskResult> {
        
        const startTime = Date.now();
        this.routingStats.totalRequests++;
        
        try {
            this.logger.info(`Routing task ${request.id} with strategy ${strategy}`);

            // Find best agent for the task
            const agent = await this.agentRegistry.findBestAgent(
                request.requiredCapabilities,
                strategy
            );

            if (!agent) {
                // Try fallback strategy if provided
                if (fallbackStrategy && fallbackStrategy !== strategy) {
                    this.logger.warn(`No agent found with ${strategy}, trying fallback ${fallbackStrategy}`);
                    return await this.routeTask(request, fallbackStrategy);
                }

                // Queue task for later processing
                this.logger.warn(`No available agents for task ${request.id}, queuing for later`);
                await this.taskQueue.enqueueTask(request);
                throw new Error(`No available agents for required capabilities: ${request.requiredCapabilities.join(', ')}`);
            }

            // Route directly to agent or through message bus
            const result = await this.executeTaskOnAgent(agent.id, request);

            // Update routing statistics
            this.routingStats.successfulRoutes++;
            this.updateRoutingStats(strategy, Date.now() - startTime);

            this.logger.info(`Task ${request.id} completed successfully by agent ${agent.id}`);
            return result;

        } catch (error) {
            this.routingStats.failedRoutes++;
            this.logger.error(`Failed to route task ${request.id}:`, error);
            throw error;
        }
    }

    /**
     * Route multiple tasks in parallel
     */
    public async routeTasksBatch(
        requests: TaskRequest[],
        strategy: LoadBalancingStrategy = LoadBalancingStrategy.CAPABILITY_MATCH
    ): Promise<TaskResult[]> {
        
        this.logger.info(`Routing batch of ${requests.length} tasks`);

        const routingPromises = requests.map(async (request) => {
            try {
                return await this.routeTask(request, strategy);
            } catch (error) {
                // Create error result for failed routing
                return {
                    taskId: request.id,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown routing error',
                    processingTime: 0,
                    completedAt: new Date(),
                    agentId: 'none'
                } as TaskResult;
            }
        });

        const results = await Promise.allSettled(routingPromises);
        
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    taskId: requests[index].id,
                    success: false,
                    error: result.reason?.message || 'Task routing failed',
                    processingTime: 0,
                    completedAt: new Date(),
                    agentId: 'none'
                } as TaskResult;
            }
        });
    }

    /**
     * Route task with automatic load balancing
     */
    public async routeTaskAutoBalanced(
        request: TaskRequest
    ): Promise<TaskResult> {
        
        // Get available agents for required capabilities
        const candidates = await this.agentRegistry.discoverAgents({
            capabilities: request.requiredCapabilities,
            healthStatus: 'healthy'
        });

        if (candidates.length === 0) {
            throw new Error('No healthy agents available for task');
        }

        // Select best strategy based on current system state
        const strategy = await this.selectOptimalStrategy(candidates, request);
        
        return await this.routeTask(request, strategy);
    }

    /**
     * Route streaming task with real-time updates
     */
    public async routeStreamingTask(
        request: TaskRequest,
        onProgress: (progress: number) => void,
        onPartialResult: (partial: any) => void
    ): Promise<TaskResult> {
        
        // Find agent that supports streaming
        const streamingAgents = await this.agentRegistry.discoverAgents({
            capabilities: [...request.requiredCapabilities, AgentCapability.STREAMING],
            healthStatus: 'healthy'
        });

        if (streamingAgents.length === 0) {
            // Fallback to regular routing
            this.logger.warn('No streaming agents available, falling back to regular processing');
            return await this.routeTask(request);
        }

        const agent = streamingAgents[0];
        
        // Set up streaming message handlers
        const progressHandler = (message: AgentMessage) => {
            if (message.type === MessageType.TASK_RESPONSE && message.payload.progress) {
                onProgress(message.payload.progress);
            }
            if (message.payload.partialResult) {
                onPartialResult(message.payload.partialResult);
            }
        };

        this.messageBus.on('messageReceived', progressHandler);

        try {
            const result = await this.executeTaskOnAgent(agent.id, request);
            this.messageBus.off('messageReceived', progressHandler);
            return result;
        } catch (error) {
            this.messageBus.off('messageReceived', progressHandler);
            throw error;
        }
    }

    /**
     * Get routing recommendations for a task
     */
    public async getRoutingRecommendations(
        request: TaskRequest
    ): Promise<{
        recommendedStrategy: LoadBalancingStrategy;
        availableAgents: number;
        estimatedWaitTime: number;
        alternativeStrategies: LoadBalancingStrategy[];
    }> {
        
        const candidates = await this.agentRegistry.discoverAgents({
            capabilities: request.requiredCapabilities,
            healthStatus: 'healthy'
        });

        const queueStats = await this.taskQueue.getStats();
        const estimatedWaitTime = this.calculateEstimatedWaitTime(request, queueStats);

        return {
            recommendedStrategy: await this.selectOptimalStrategy(candidates, request),
            availableAgents: candidates.length,
            estimatedWaitTime,
            alternativeStrategies: this.getAlternativeStrategies(candidates)
        };
    }

    /**
     * Get routing statistics and performance metrics
     */
    public getRoutingStats(): {
        totalRequests: number;
        successRate: number;
        averageResponseTime: number;
        routingsByStrategy: Record<string, number>;
        currentLoad: number;
    } {
        
        const successRate = this.routingStats.totalRequests > 0 
            ? this.routingStats.successfulRoutes / this.routingStats.totalRequests 
            : 0;

        return {
            totalRequests: this.routingStats.totalRequests,
            successRate: Math.round(successRate * 100) / 100,
            averageResponseTime: this.routingStats.averageResponseTime,
            routingsByStrategy: Object.fromEntries(this.routingStats.routingsByStrategy),
            currentLoad: this.calculateCurrentLoad()
        };
    }

    /**
     * Health check for router components
     */
    public async healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        components: {
            agentRegistry: boolean;
            taskQueue: boolean;
            messageBus: boolean;
        };
        metrics: any;
    }> {
        
        try {
            // Check component health
            const registryStats = await this.agentRegistry.getStats();
            const queueStats = await this.taskQueue.getStats();
            const messageBusStats = await this.messageBus.getStats();

            const components = {
                agentRegistry: registryStats.totalAgents > 0,
                taskQueue: true, // Basic availability check
                messageBus: messageBusStats.activeSubscriptions >= 0
            };

            const allHealthy = Object.values(components).every(Boolean);
            const status = allHealthy ? 'healthy' : 'degraded';

            return {
                status,
                components,
                metrics: {
                    ...this.getRoutingStats(),
                    registryStats,
                    queueStats,
                    messageBusStats
                }
            };

        } catch (error) {
            this.logger.error('Health check failed:', error);
            return {
                status: 'unhealthy',
                components: {
                    agentRegistry: false,
                    taskQueue: false,
                    messageBus: false
                },
                metrics: this.getRoutingStats()
            };
        }
    }

    // Private methods
    private async executeTaskOnAgent(agentId: string, request: TaskRequest): Promise<TaskResult> {
        // Create message for task execution
        const message: AgentMessage = {
            id: this.generateMessageId(),
            type: MessageType.TASK_REQUEST,
            from: 'router',
            to: agentId,
            payload: request,
            timestamp: new Date(),
            ttl: request.timeout || 30000
        };

        // Send request and wait for response
        const response = await this.messageBus.sendRequest(message, request.timeout || 30000);
        
        if (!response.payload) {
            throw new Error('Invalid response from agent');
        }

        return response.payload as TaskResult;
    }

    private async selectOptimalStrategy(
        candidates: any[], 
        request: TaskRequest
    ): Promise<LoadBalancingStrategy> {
        
        // Simple strategy selection logic - can be enhanced with ML
        if (candidates.length === 1) {
            return LoadBalancingStrategy.ROUND_ROBIN;
        }

        if (request.priority === 'critical') {
            return LoadBalancingStrategy.RESPONSE_TIME;
        }

        if (request.requiredCapabilities.length > 2) {
            return LoadBalancingStrategy.CAPABILITY_MATCH;
        }

        return LoadBalancingStrategy.LEAST_CONNECTIONS;
    }

    private getAlternativeStrategies(candidates: any[]): LoadBalancingStrategy[] {
        const strategies = [
            LoadBalancingStrategy.ROUND_ROBIN,
            LoadBalancingStrategy.LEAST_CONNECTIONS,
            LoadBalancingStrategy.CAPABILITY_MATCH,
            LoadBalancingStrategy.RESPONSE_TIME
        ];

        return strategies.slice(0, Math.min(3, candidates.length));
    }

    private calculateEstimatedWaitTime(request: TaskRequest, queueStats: any): number {
        // Simple estimation based on queue depth and average processing time
        const totalQueued = Object.values(queueStats.queued).reduce((sum: number, count: any) => sum + count, 0) as number;
        const averageProcessingTime = this.routingStats.averageResponseTime || 5000;
        
        return totalQueued * averageProcessingTime / 1000; // Return in seconds
    }

    private calculateCurrentLoad(): number {
        // Simple load calculation - can be enhanced
        const recentRequests = this.routingStats.totalRequests;
        return Math.min(100, recentRequests / 100 * 100); // Normalize to percentage
    }

    private updateRoutingStats(strategy: LoadBalancingStrategy, responseTime: number): void {
        // Update strategy counter
        const currentCount = this.routingStats.routingsByStrategy.get(strategy) || 0;
        this.routingStats.routingsByStrategy.set(strategy, currentCount + 1);

        // Update average response time
        const total = this.routingStats.averageResponseTime * (this.routingStats.successfulRoutes - 1);
        this.routingStats.averageResponseTime = (total + responseTime) / this.routingStats.successfulRoutes;
    }

    private generateMessageId(): string {
        return `router_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default RequestRouter;