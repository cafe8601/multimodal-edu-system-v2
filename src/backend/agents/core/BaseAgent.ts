import { EventEmitter } from 'events';
import { Logger } from '../../infrastructure/logging/logger';
import { AgentInterface } from './AgentInterface';
import { AgentCapability, AgentState, AgentMetrics, TaskRequest, TaskResult } from './types';

/**
 * Abstract base class for all AI agents in the system
 * Provides lifecycle management, communication, and standard protocols
 */
export abstract class BaseAgent extends EventEmitter implements AgentInterface {
    protected readonly id: string;
    protected readonly name: string;
    protected readonly capabilities: Set<AgentCapability>;
    protected state: AgentState;
    protected metrics: AgentMetrics;
    protected readonly logger: Logger;
    protected healthCheckInterval?: NodeJS.Timeout;
    protected maxRetries: number = 3;
    protected retryDelay: number = 1000;

    constructor(
        id: string,
        name: string,
        capabilities: AgentCapability[],
        logger?: Logger
    ) {
        super();
        this.id = id;
        this.name = name;
        this.capabilities = new Set(capabilities);
        this.state = AgentState.INITIALIZING;
        this.metrics = this.initializeMetrics();
        this.logger = logger || new Logger(`Agent:${name}`);
        
        this.setupEventHandlers();
    }

    // Core Interface Implementation
    public getId(): string {
        return this.id;
    }

    public getName(): string {
        return this.name;
    }

    public getCapabilities(): AgentCapability[] {
        return Array.from(this.capabilities);
    }

    public getState(): AgentState {
        return this.state;
    }

    public getMetrics(): AgentMetrics {
        return { ...this.metrics };
    }

    // Lifecycle Management
    public async initialize(): Promise<void> {
        try {
            this.logger.info(`Initializing agent ${this.name}`);
            this.state = AgentState.INITIALIZING;
            this.emit('stateChanged', this.state);

            await this.onInitialize();
            
            this.state = AgentState.IDLE;
            this.emit('initialized');
            this.emit('stateChanged', this.state);
            
            this.startHealthCheck();
            this.logger.info(`Agent ${this.name} initialized successfully`);
        } catch (error) {
            this.state = AgentState.ERROR;
            this.emit('error', error);
            this.logger.error(`Failed to initialize agent ${this.name}:`, error);
            throw error;
        }
    }

    public async shutdown(): Promise<void> {
        try {
            this.logger.info(`Shutting down agent ${this.name}`);
            this.state = AgentState.SHUTTING_DOWN;
            this.emit('stateChanged', this.state);

            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            await this.onShutdown();
            
            this.state = AgentState.SHUTDOWN;
            this.emit('shutdown');
            this.emit('stateChanged', this.state);
            
            this.removeAllListeners();
            this.logger.info(`Agent ${this.name} shut down successfully`);
        } catch (error) {
            this.logger.error(`Error during shutdown of agent ${this.name}:`, error);
            throw error;
        }
    }

    public async processTask(task: TaskRequest): Promise<TaskResult> {
        const startTime = Date.now();
        this.metrics.tasksReceived++;
        
        try {
            this.logger.info(`Processing task ${task.id} for agent ${this.name}`);
            
            if (this.state !== AgentState.IDLE && this.state !== AgentState.BUSY) {
                throw new Error(`Agent ${this.name} is not available for task processing. Current state: ${this.state}`);
            }

            // Check if agent has required capabilities
            if (!this.canHandleTask(task)) {
                throw new Error(`Agent ${this.name} cannot handle task of type ${task.type}`);
            }

            this.state = AgentState.BUSY;
            this.emit('stateChanged', this.state);
            this.emit('taskStarted', task);

            const result = await this.executeTask(task);
            
            this.metrics.tasksCompleted++;
            this.metrics.totalProcessingTime += Date.now() - startTime;
            this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.tasksCompleted;
            
            this.state = AgentState.IDLE;
            this.emit('stateChanged', this.state);
            this.emit('taskCompleted', task, result);
            
            this.logger.info(`Task ${task.id} completed successfully`);
            return result;
            
        } catch (error) {
            this.metrics.tasksErrored++;
            this.state = AgentState.ERROR;
            this.emit('stateChanged', this.state);
            this.emit('taskFailed', task, error);
            
            this.logger.error(`Task ${task.id} failed:`, error);
            
            // Attempt recovery
            await this.attemptRecovery();
            
            throw error;
        }
    }

    // Health Check
    public async healthCheck(): Promise<boolean> {
        try {
            const isHealthy = await this.performHealthCheck();
            this.metrics.lastHealthCheck = Date.now();
            
            if (!isHealthy && this.state !== AgentState.ERROR) {
                this.state = AgentState.ERROR;
                this.emit('stateChanged', this.state);
                this.emit('healthCheckFailed');
            }
            
            return isHealthy;
        } catch (error) {
            this.logger.error(`Health check failed for agent ${this.name}:`, error);
            return false;
        }
    }

    // Abstract methods for subclasses to implement
    protected abstract onInitialize(): Promise<void>;
    protected abstract onShutdown(): Promise<void>;
    protected abstract executeTask(task: TaskRequest): Promise<TaskResult>;
    protected abstract performHealthCheck(): Promise<boolean>;
    protected abstract canHandleTask(task: TaskRequest): boolean;

    // Protected helper methods
    protected async attemptRecovery(): Promise<void> {
        try {
            this.logger.info(`Attempting recovery for agent ${this.name}`);
            await this.onRecover();
            this.state = AgentState.IDLE;
            this.emit('stateChanged', this.state);
            this.emit('recovered');
        } catch (error) {
            this.logger.error(`Recovery failed for agent ${this.name}:`, error);
            // Keep agent in error state
        }
    }

    protected async onRecover(): Promise<void> {
        // Default recovery implementation - can be overridden
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    }

    protected async executeWithRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = this.maxRetries
    ): Promise<T> {
        let lastError: Error;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                this.logger.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }
            }
        }
        
        throw lastError!;
    }

    // Private methods
    private initializeMetrics(): AgentMetrics {
        return {
            tasksReceived: 0,
            tasksCompleted: 0,
            tasksErrored: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            lastHealthCheck: Date.now(),
            uptime: Date.now()
        };
    }

    private setupEventHandlers(): void {
        this.on('error', (error) => {
            this.logger.error(`Agent ${this.name} error:`, error);
        });

        this.on('stateChanged', (newState) => {
            this.logger.debug(`Agent ${this.name} state changed to: ${newState}`);
        });
    }

    private startHealthCheck(): void {
        // Perform health check every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            await this.healthCheck();
        }, 30000);
    }
}

export default BaseAgent;