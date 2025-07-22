import { AgentCapability, AgentState, AgentMetrics, TaskRequest, TaskResult } from './types';

/**
 * Standard interface that all agents must implement
 * Defines communication protocols and lifecycle methods
 */
export interface AgentInterface {
    /**
     * Get unique agent identifier
     */
    getId(): string;

    /**
     * Get human-readable agent name
     */
    getName(): string;

    /**
     * Get list of capabilities this agent supports
     */
    getCapabilities(): AgentCapability[];

    /**
     * Get current agent state
     */
    getState(): AgentState;

    /**
     * Get performance metrics for this agent
     */
    getMetrics(): AgentMetrics;

    /**
     * Initialize the agent (async setup)
     */
    initialize(): Promise<void>;

    /**
     * Shutdown the agent gracefully
     */
    shutdown(): Promise<void>;

    /**
     * Process a task request and return result
     */
    processTask(task: TaskRequest): Promise<TaskResult>;

    /**
     * Perform health check
     */
    healthCheck(): Promise<boolean>;

    /**
     * Event listeners for agent lifecycle
     */
    on(event: 'initialized', listener: () => void): this;
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'stateChanged', listener: (state: AgentState) => void): this;
    on(event: 'taskStarted', listener: (task: TaskRequest) => void): this;
    on(event: 'taskCompleted', listener: (task: TaskRequest, result: TaskResult) => void): this;
    on(event: 'taskFailed', listener: (task: TaskRequest, error: Error) => void): this;
    on(event: 'healthCheckFailed', listener: () => void): this;
    on(event: 'recovered', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;

    /**
     * Remove event listeners
     */
    off(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;

    /**
     * Emit events
     */
    emit(event: string, ...args: any[]): boolean;
}

/**
 * Extended interface for specialized agents with additional capabilities
 */
export interface SpecializedAgentInterface extends AgentInterface {
    /**
     * Get specialized configuration for this agent type
     */
    getConfiguration(): Record<string, any>;

    /**
     * Update agent configuration
     */
    updateConfiguration(config: Record<string, any>): Promise<void>;

    /**
     * Get agent-specific status information
     */
    getStatus(): Promise<Record<string, any>>;

    /**
     * Validate if the agent can process a specific task type
     */
    validateTask(task: TaskRequest): Promise<boolean>;

    /**
     * Get estimated processing time for a task
     */
    estimateProcessingTime(task: TaskRequest): Promise<number>;
}

/**
 * Interface for agents that support streaming responses
 */
export interface StreamingAgentInterface extends AgentInterface {
    /**
     * Process task with streaming response
     */
    processTaskStream(
        task: TaskRequest, 
        onProgress: (progress: number) => void,
        onPartialResult: (partial: any) => void
    ): Promise<TaskResult>;
}

/**
 * Interface for agents that support batch processing
 */
export interface BatchProcessingAgentInterface extends AgentInterface {
    /**
     * Process multiple tasks in batch
     */
    processBatch(tasks: TaskRequest[]): Promise<TaskResult[]>;

    /**
     * Get optimal batch size for this agent
     */
    getOptimalBatchSize(): number;

    /**
     * Check if batch processing is currently available
     */
    canProcessBatch(): boolean;
}

export default AgentInterface;