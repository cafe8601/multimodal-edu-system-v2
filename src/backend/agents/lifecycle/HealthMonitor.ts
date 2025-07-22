import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../infrastructure/logging/logger';
import { AgentInterface } from '../core/AgentInterface';
import { AgentRegistry } from '../core/AgentRegistry';
import { EventSystem, EventType } from '../communication/EventSystem';
import { AgentState, HealthCheckResult } from '../core/types';

/**
 * Health monitor for tracking agent status and system health
 */
export interface HealthMetrics {
    agentId: string;
    timestamp: Date;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate: number;
    successRate: number;
    lastTaskTime?: Date;
    diagnostics?: Record<string, any>;
}

export interface HealthThresholds {
    responseTimeWarning: number;      // ms
    responseTimeCritical: number;     // ms
    errorRateWarning: number;         // percentage
    errorRateCritical: number;        // percentage
    cpuUsageWarning?: number;         // percentage
    cpuUsageCritical?: number;        // percentage
    memoryUsageWarning?: number;      // percentage
    memoryUsageCritical?: number;     // percentage
}

export class HealthMonitor extends EventEmitter {
    private readonly redis: Redis;
    private readonly logger: Logger;
    private readonly agentRegistry: AgentRegistry;
    private readonly eventSystem: EventSystem;
    
    private readonly healthKey = 'agents:health';
    private readonly metricsKey = 'agents:metrics';
    private readonly agents: Map<string, AgentInterface> = new Map();
    private readonly thresholds: HealthThresholds;
    
    private monitoringInterval?: NodeJS.Timeout;
    private isMonitoring = false;
    private readonly checkInterval = 30000; // 30 seconds

    constructor(
        redis: Redis,
        agentRegistry: AgentRegistry,
        eventSystem: EventSystem,
        thresholds?: Partial<HealthThresholds>,
        logger?: Logger
    ) {
        super();
        this.redis = redis;
        this.agentRegistry = agentRegistry;
        this.eventSystem = eventSystem;
        this.logger = logger || new Logger('HealthMonitor');

        // Set default thresholds
        this.thresholds = {
            responseTimeWarning: 5000,     // 5 seconds
            responseTimeCritical: 15000,   // 15 seconds
            errorRateWarning: 10,          // 10%
            errorRateCritical: 25,         // 25%
            cpuUsageWarning: 70,           // 70%
            cpuUsageCritical: 90,          // 90%
            memoryUsageWarning: 80,        // 80%
            memoryUsageCritical: 95,       // 95%
            ...thresholds
        };
    }

    /**
     * Start monitoring agents
     */
    public async startMonitoring(): Promise<void> {
        if (this.isMonitoring) {
            this.logger.warn('Health monitoring is already running');
            return;
        }

        try {
            this.isMonitoring = true;
            
            // Perform initial health check
            await this.performSystemHealthCheck();
            
            // Start periodic monitoring
            this.monitoringInterval = setInterval(async () => {
                try {
                    await this.performSystemHealthCheck();
                } catch (error) {
                    this.logger.error('Error during health check:', error);
                }
            }, this.checkInterval);

            this.logger.info('Health monitoring started');
            this.emit('monitoringStarted');

        } catch (error) {
            this.isMonitoring = false;
            this.logger.error('Failed to start health monitoring:', error);
            throw error;
        }
    }

    /**
     * Stop monitoring agents
     */
    public async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }

        this.agents.clear();
        this.removeAllListeners();

        this.logger.info('Health monitoring stopped');
        this.emit('monitoringStopped');
    }

    /**
     * Register an agent for monitoring
     */
    public async registerAgent(agent: AgentInterface): Promise<void> {
        try {
            this.agents.set(agent.getId(), agent);

            // Set up agent event listeners
            agent.on('stateChanged', (state: AgentState) => {
                this.handleAgentStateChange(agent.getId(), state);
            });

            agent.on('error', (error: Error) => {
                this.handleAgentError(agent.getId(), error);
            });

            // Perform initial health check
            await this.checkAgentHealth(agent.getId());

            this.logger.info(`Agent ${agent.getName()} (${agent.getId()}) registered for monitoring`);

        } catch (error) {
            this.logger.error(`Failed to register agent ${agent.getId()} for monitoring:`, error);
            throw error;
        }
    }

    /**
     * Unregister an agent from monitoring
     */
    public async unregisterAgent(agentId: string): Promise<void> {
        const agent = this.agents.get(agentId);
        
        if (agent) {
            // Remove event listeners
            agent.removeAllListeners('stateChanged');
            agent.removeAllListeners('error');
        }

        this.agents.delete(agentId);

        // Clean up stored health data
        await this.redis.hdel(this.healthKey, agentId);
        await this.redis.hdel(this.metricsKey, agentId);

        this.logger.info(`Agent ${agentId} unregistered from monitoring`);
    }

    /**
     * Get health status for a specific agent
     */
    public async getAgentHealth(agentId: string): Promise<HealthMetrics | null> {
        try {
            const healthData = await this.redis.hget(this.healthKey, agentId);
            return healthData ? JSON.parse(healthData) : null;
        } catch (error) {
            this.logger.error(`Failed to get health for agent ${agentId}:`, error);
            return null;
        }
    }

    /**
     * Get health status for all monitored agents
     */
    public async getAllAgentsHealth(): Promise<HealthMetrics[]> {
        try {
            const healthData = await this.redis.hgetall(this.healthKey);
            const healthMetrics: HealthMetrics[] = [];

            for (const [agentId, data] of Object.entries(healthData)) {
                try {
                    healthMetrics.push(JSON.parse(data));
                } catch (parseError) {
                    this.logger.error(`Failed to parse health data for agent ${agentId}:`, parseError);
                }
            }

            return healthMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        } catch (error) {
            this.logger.error('Failed to get all agents health:', error);
            return [];
        }
    }

    /**
     * Get system health summary
     */
    public async getSystemHealthSummary(): Promise<{
        overall: 'healthy' | 'degraded' | 'unhealthy';
        totalAgents: number;
        healthyAgents: number;
        degradedAgents: number;
        unhealthyAgents: number;
        alerts: number;
        timestamp: Date;
    }> {
        
        const allHealth = await this.getAllAgentsHealth();
        
        const summary = {
            overall: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
            totalAgents: allHealth.length,
            healthyAgents: allHealth.filter(h => h.status === 'healthy').length,
            degradedAgents: allHealth.filter(h => h.status === 'degraded').length,
            unhealthyAgents: allHealth.filter(h => h.status === 'unhealthy').length,
            alerts: 0,
            timestamp: new Date()
        };

        // Determine overall system health
        const unhealthyRatio = summary.unhealthyAgents / summary.totalAgents;
        const degradedRatio = (summary.degradedAgents + summary.unhealthyAgents) / summary.totalAgents;

        if (unhealthyRatio > 0.25) { // More than 25% unhealthy
            summary.overall = 'unhealthy';
        } else if (degradedRatio > 0.5) { // More than 50% degraded/unhealthy
            summary.overall = 'degraded';
        }

        summary.alerts = summary.degradedAgents + summary.unhealthyAgents;

        return summary;
    }

    /**
     * Get health trends for an agent
     */
    public async getHealthTrends(
        agentId: string, 
        timeRange: number = 3600000 // 1 hour in ms
    ): Promise<HealthMetrics[]> {
        
        try {
            const endTime = Date.now();
            const startTime = endTime - timeRange;

            // Get historical metrics (in a real implementation, you'd store time series data)
            const metricsData = await this.redis.hget(this.metricsKey, `${agentId}:history`);
            
            if (!metricsData) {
                return [];
            }

            const allMetrics: HealthMetrics[] = JSON.parse(metricsData);
            
            return allMetrics.filter(metric => 
                metric.timestamp.getTime() >= startTime && 
                metric.timestamp.getTime() <= endTime
            );

        } catch (error) {
            this.logger.error(`Failed to get health trends for agent ${agentId}:`, error);
            return [];
        }
    }

    /**
     * Force health check for specific agent
     */
    public async checkAgentHealth(agentId: string): Promise<HealthMetrics> {
        const startTime = Date.now();
        
        try {
            const agent = this.agents.get(agentId);
            
            if (!agent) {
                throw new Error(`Agent ${agentId} not found in monitoring registry`);
            }

            // Perform health check
            const isHealthy = await agent.healthCheck();
            const responseTime = Date.now() - startTime;
            const agentMetrics = agent.getMetrics();

            // Calculate rates
            const errorRate = agentMetrics.tasksReceived > 0 
                ? (agentMetrics.tasksErrored / agentMetrics.tasksReceived) * 100 
                : 0;
            const successRate = agentMetrics.tasksReceived > 0 
                ? (agentMetrics.tasksCompleted / agentMetrics.tasksReceived) * 100 
                : 100;

            // Determine health status
            const status = this.determineHealthStatus(responseTime, errorRate);

            const healthMetrics: HealthMetrics = {
                agentId,
                timestamp: new Date(),
                status,
                responseTime,
                errorRate,
                successRate,
                diagnostics: {
                    isHealthy,
                    state: agent.getState(),
                    uptime: Date.now() - agentMetrics.uptime,
                    totalTasks: agentMetrics.tasksReceived,
                    averageProcessingTime: agentMetrics.averageProcessingTime
                }
            };

            // Store health metrics
            await this.storeHealthMetrics(healthMetrics);

            // Update agent registry
            await this.agentRegistry.updateAgentHealth(agentId, {
                status,
                timestamp: new Date(),
                details: healthMetrics.diagnostics
            });

            // Check for alerts
            await this.checkHealthAlerts(healthMetrics);

            return healthMetrics;

        } catch (error) {
            const errorMetrics: HealthMetrics = {
                agentId,
                timestamp: new Date(),
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                errorRate: 100,
                successRate: 0,
                diagnostics: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    healthCheckFailed: true
                }
            };

            await this.storeHealthMetrics(errorMetrics);
            await this.checkHealthAlerts(errorMetrics);

            this.logger.error(`Health check failed for agent ${agentId}:`, error);
            return errorMetrics;
        }
    }

    // Private methods
    private async performSystemHealthCheck(): Promise<void> {
        try {
            const registeredAgents = await this.agentRegistry.getAllAgents();
            
            // Check health of all registered agents
            const healthCheckPromises = registeredAgents.map(agentRegistration => 
                this.checkAgentHealth(agentRegistration.id).catch(error => {
                    this.logger.error(`Failed to check health for agent ${agentRegistration.id}:`, error);
                    return null;
                })
            );

            await Promise.allSettled(healthCheckPromises);

            // Publish system health event
            await this.eventSystem.publishEvent({
                id: `health_check_${Date.now()}`,
                type: EventType.AGENT_HEALTH_CHECK,
                source: 'health_monitor',
                payload: await this.getSystemHealthSummary(),
                timestamp: new Date(),
                priority: 'medium'
            });

        } catch (error) {
            this.logger.error('System health check failed:', error);
        }
    }

    private determineHealthStatus(
        responseTime: number, 
        errorRate: number,
        cpuUsage?: number,
        memoryUsage?: number
    ): 'healthy' | 'degraded' | 'unhealthy' {
        
        // Check critical thresholds
        if (
            responseTime > this.thresholds.responseTimeCritical ||
            errorRate > this.thresholds.errorRateCritical ||
            (cpuUsage && cpuUsage > (this.thresholds.cpuUsageCritical || 95)) ||
            (memoryUsage && memoryUsage > (this.thresholds.memoryUsageCritical || 95))
        ) {
            return 'unhealthy';
        }

        // Check warning thresholds
        if (
            responseTime > this.thresholds.responseTimeWarning ||
            errorRate > this.thresholds.errorRateWarning ||
            (cpuUsage && cpuUsage > (this.thresholds.cpuUsageWarning || 70)) ||
            (memoryUsage && memoryUsage > (this.thresholds.memoryUsageWarning || 80))
        ) {
            return 'degraded';
        }

        return 'healthy';
    }

    private async storeHealthMetrics(metrics: HealthMetrics): Promise<void> {
        try {
            // Store current health
            await this.redis.hset(this.healthKey, metrics.agentId, JSON.stringify(metrics));

            // Store historical data (simplified - in production, use time series DB)
            const historyKey = `${metrics.agentId}:history`;
            const existingHistory = await this.redis.hget(this.metricsKey, historyKey);
            
            let history: HealthMetrics[] = [];
            if (existingHistory) {
                history = JSON.parse(existingHistory);
            }

            history.push(metrics);
            
            // Keep only last 100 entries
            if (history.length > 100) {
                history = history.slice(-100);
            }

            await this.redis.hset(this.metricsKey, historyKey, JSON.stringify(history));

        } catch (error) {
            this.logger.error('Failed to store health metrics:', error);
        }
    }

    private async checkHealthAlerts(metrics: HealthMetrics): Promise<void> {
        if (metrics.status === 'unhealthy') {
            await this.eventSystem.publishEvent({
                id: `alert_${metrics.agentId}_${Date.now()}`,
                type: EventType.SYSTEM_ALERT,
                source: 'health_monitor',
                payload: {
                    severity: 'critical',
                    agentId: metrics.agentId,
                    message: `Agent ${metrics.agentId} is unhealthy`,
                    metrics
                },
                timestamp: new Date(),
                priority: 'critical'
            });

            this.emit('agentUnhealthy', metrics);
        } else if (metrics.status === 'degraded') {
            await this.eventSystem.publishEvent({
                id: `warning_${metrics.agentId}_${Date.now()}`,
                type: EventType.PERFORMANCE_WARNING,
                source: 'health_monitor',
                payload: {
                    severity: 'warning',
                    agentId: metrics.agentId,
                    message: `Agent ${metrics.agentId} performance is degraded`,
                    metrics
                },
                timestamp: new Date(),
                priority: 'high'
            });

            this.emit('agentDegraded', metrics);
        }
    }

    private handleAgentStateChange(agentId: string, state: AgentState): void {
        this.logger.debug(`Agent ${agentId} state changed to: ${state}`);
        
        if (state === AgentState.ERROR) {
            // Trigger immediate health check on error state
            this.checkAgentHealth(agentId).catch(error => {
                this.logger.error(`Failed to check health after state change for ${agentId}:`, error);
            });
        }
    }

    private handleAgentError(agentId: string, error: Error): void {
        this.logger.warn(`Agent ${agentId} reported error:`, error);
        
        // Trigger health check after error
        this.checkAgentHealth(agentId).catch(healthError => {
            this.logger.error(`Failed to check health after error for ${agentId}:`, healthError);
        });
    }
}

export default HealthMonitor;