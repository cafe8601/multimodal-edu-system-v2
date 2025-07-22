/**
 * Core types and enums for the agent system
 */

/**
 * Agent state enum representing lifecycle states
 */
export enum AgentState {
    INITIALIZING = 'initializing',
    IDLE = 'idle',
    BUSY = 'busy',
    ERROR = 'error',
    SHUTTING_DOWN = 'shutting_down',
    SHUTDOWN = 'shutdown',
    MAINTENANCE = 'maintenance'
}

/**
 * Agent capabilities enum defining what an agent can do
 */
export enum AgentCapability {
    TEXT_PROCESSING = 'text_processing',
    VISION_ANALYSIS = 'vision_analysis',
    SPEECH_PROCESSING = 'speech_processing',
    TUTORING = 'tutoring',
    ASSESSMENT = 'assessment',
    NATURAL_LANGUAGE = 'natural_language',
    MACHINE_LEARNING = 'machine_learning',
    DATA_ANALYSIS = 'data_analysis',
    CONTENT_GENERATION = 'content_generation',
    TRANSLATION = 'translation',
    SUMMARIZATION = 'summarization',
    SENTIMENT_ANALYSIS = 'sentiment_analysis',
    ENTITY_EXTRACTION = 'entity_extraction',
    CLASSIFICATION = 'classification',
    QUESTION_ANSWERING = 'question_answering',
    DIALOGUE_MANAGEMENT = 'dialogue_management',
    MULTIMODAL_PROCESSING = 'multimodal_processing',
    REAL_TIME_PROCESSING = 'real_time_processing',
    BATCH_PROCESSING = 'batch_processing',
    STREAMING = 'streaming'
}

/**
 * Task priority levels
 */
export enum TaskPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * Task request structure
 */
export interface TaskRequest {
    id: string;
    type: string;
    priority: TaskPriority;
    data: any;
    metadata?: Record<string, any>;
    requiredCapabilities: AgentCapability[];
    timeout?: number;
    retryCount?: number;
    createdAt: Date;
    deadline?: Date;
}

/**
 * Task result structure
 */
export interface TaskResult {
    taskId: string;
    success: boolean;
    data?: any;
    error?: string;
    metadata?: Record<string, any>;
    processingTime: number;
    completedAt: Date;
    agentId: string;
}

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
    tasksReceived: number;
    tasksCompleted: number;
    tasksErrored: number;
    totalProcessingTime: number;
    averageProcessingTime: number;
    lastHealthCheck: number;
    uptime: number;
}

/**
 * Agent registration information
 */
export interface AgentRegistration {
    id: string;
    name: string;
    type: string;
    capabilities: AgentCapability[];
    endpoint?: string;
    version: string;
    metadata: Record<string, any>;
    registeredAt: Date;
    lastSeen: Date;
    health: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        lastCheck: Date;
        details?: Record<string, any>;
    };
}

/**
 * Agent discovery criteria
 */
export interface AgentDiscoveryCriteria {
    capabilities?: AgentCapability[];
    minCapabilityMatch?: number; // Minimum number of matching capabilities
    excludeTypes?: string[];
    includeTypes?: string[];
    healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
    maxResponseTime?: number;
    minSuccessRate?: number;
}

/**
 * Load balancing strategy types
 */
export enum LoadBalancingStrategy {
    ROUND_ROBIN = 'round_robin',
    LEAST_CONNECTIONS = 'least_connections',
    WEIGHTED_ROUND_ROBIN = 'weighted_round_robin',
    RESPONSE_TIME = 'response_time',
    CAPABILITY_MATCH = 'capability_match',
    RANDOM = 'random'
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
    CLOSED = 'closed',
    OPEN = 'open',
    HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringWindow: number;
    minThroughput: number;
}

/**
 * Message types for inter-agent communication
 */
export enum MessageType {
    TASK_REQUEST = 'task_request',
    TASK_RESPONSE = 'task_response',
    AGENT_REGISTRATION = 'agent_registration',
    AGENT_DEREGISTRATION = 'agent_deregistration',
    HEALTH_CHECK = 'health_check',
    SYSTEM_NOTIFICATION = 'system_notification',
    CAPABILITY_QUERY = 'capability_query',
    LOAD_BALANCE_REQUEST = 'load_balance_request',
    ERROR_NOTIFICATION = 'error_notification'
}

/**
 * Inter-agent message structure
 */
export interface AgentMessage {
    id: string;
    type: MessageType;
    from: string;
    to: string | 'broadcast';
    payload: any;
    timestamp: Date;
    correlationId?: string;
    replyTo?: string;
    ttl?: number;
}

/**
 * Configuration for agent factories
 */
export interface AgentFactoryConfig {
    type: string;
    defaultCapabilities: AgentCapability[];
    configurationSchema: Record<string, any>;
    resourceRequirements: {
        cpu?: number;
        memory?: number;
        gpu?: boolean;
    };
    scalingLimits: {
        min: number;
        max: number;
    };
}

/**
 * Health check result
 */
export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    details?: Record<string, any>;
    metrics?: AgentMetrics;
    diagnostics?: string[];
}

/**
 * Agent configuration interface
 */
export interface AgentConfig {
    id: string;
    name: string;
    type: string;
    capabilities: AgentCapability[];
    maxConcurrentTasks?: number;
    timeout?: number;
    retryCount?: number;
    healthCheckInterval?: number;
    circuitBreaker?: CircuitBreakerConfig;
    logging?: {
        level: 'debug' | 'info' | 'warn' | 'error';
        enableMetrics: boolean;
    };
    resources?: {
        cpu?: number;
        memory?: number;
        gpu?: boolean;
    };
}

export default {
    AgentState,
    AgentCapability,
    TaskPriority,
    MessageType,
    LoadBalancingStrategy,
    CircuitBreakerState
};