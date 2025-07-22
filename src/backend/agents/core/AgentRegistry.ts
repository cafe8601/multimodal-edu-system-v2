import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../infrastructure/logging/logger';
import { AgentInterface } from './AgentInterface';
import { 
    AgentRegistration, 
    AgentDiscoveryCriteria, 
    AgentCapability,
    HealthCheckResult,
    LoadBalancingStrategy
} from './types';

/**
 * Central registry for agent discovery and management
 * Handles agent registration, discovery, and capability matching
 */
export class AgentRegistry extends EventEmitter {
    private readonly redis: Redis;
    private readonly logger: Logger;
    private readonly registryKey = 'agents:registry';
    private readonly healthKey = 'agents:health';
    private readonly agents: Map<string, AgentRegistration> = new Map();
    private healthCheckInterval?: NodeJS.Timeout;

    constructor(redis: Redis, logger?: Logger) {
        super();
        this.redis = redis;
        this.logger = logger || new Logger('AgentRegistry');
        this.startHealthMonitoring();
    }

    /**
     * Register an agent in the system
     */
    public async registerAgent(agent: AgentInterface, metadata: Record<string, any> = {}): Promise<void> {
        const registration: AgentRegistration = {
            id: agent.getId(),
            name: agent.getName(),
            type: this.getAgentType(agent),
            capabilities: agent.getCapabilities(),
            version: metadata.version || '1.0.0',
            metadata,
            registeredAt: new Date(),
            lastSeen: new Date(),
            health: {
                status: 'healthy',
                lastCheck: new Date()
            }
        };

        try {
            // Store in memory cache
            this.agents.set(registration.id, registration);

            // Store in Redis for persistence and cluster sharing
            await this.redis.hset(
                this.registryKey, 
                registration.id, 
                JSON.stringify(registration)
            );

            // Set TTL for automatic cleanup
            await this.redis.expire(`${this.registryKey}:${registration.id}`, 300); // 5 minutes

            this.logger.info(`Agent ${registration.name} (${registration.id}) registered successfully`);
            this.emit('agentRegistered', registration);

        } catch (error) {
            this.logger.error(`Failed to register agent ${agent.getName()}:`, error);
            throw error;
        }
    }

    /**
     * Deregister an agent from the system
     */
    public async deregisterAgent(agentId: string): Promise<void> {
        try {
            const registration = this.agents.get(agentId);
            
            // Remove from memory cache
            this.agents.delete(agentId);

            // Remove from Redis
            await this.redis.hdel(this.registryKey, agentId);
            await this.redis.hdel(this.healthKey, agentId);

            if (registration) {
                this.logger.info(`Agent ${registration.name} (${agentId}) deregistered`);
                this.emit('agentDeregistered', registration);
            }

        } catch (error) {
            this.logger.error(`Failed to deregister agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Discover agents based on criteria
     */
    public async discoverAgents(criteria: AgentDiscoveryCriteria = {}): Promise<AgentRegistration[]> {
        try {
            await this.syncFromRedis();
            
            let candidates = Array.from(this.agents.values());

            // Filter by health status
            if (criteria.healthStatus) {
                candidates = candidates.filter(agent => 
                    agent.health.status === criteria.healthStatus
                );
            }

            // Filter by types
            if (criteria.includeTypes?.length) {
                candidates = candidates.filter(agent => 
                    criteria.includeTypes!.includes(agent.type)
                );
            }

            if (criteria.excludeTypes?.length) {
                candidates = candidates.filter(agent => 
                    !criteria.excludeTypes!.includes(agent.type)
                );
            }

            // Filter by capabilities
            if (criteria.capabilities?.length) {
                candidates = candidates.filter(agent => {
                    const matchingCapabilities = agent.capabilities.filter(cap =>
                        criteria.capabilities!.includes(cap)
                    ).length;

                    const minMatch = criteria.minCapabilityMatch || criteria.capabilities!.length;
                    return matchingCapabilities >= minMatch;
                });
            }

            // Sort by capability match score (most matching capabilities first)
            if (criteria.capabilities?.length) {
                candidates.sort((a, b) => {
                    const scoreA = this.calculateCapabilityScore(a, criteria.capabilities!);
                    const scoreB = this.calculateCapabilityScore(b, criteria.capabilities!);
                    return scoreB - scoreA;
                });
            }

            this.logger.debug(`Discovered ${candidates.length} agents matching criteria`);
            return candidates;

        } catch (error) {
            this.logger.error('Failed to discover agents:', error);
            throw error;
        }
    }

    /**
     * Find the best agent for a specific task
     */
    public async findBestAgent(
        requiredCapabilities: AgentCapability[],
        strategy: LoadBalancingStrategy = LoadBalancingStrategy.CAPABILITY_MATCH
    ): Promise<AgentRegistration | null> {
        
        const candidates = await this.discoverAgents({
            capabilities: requiredCapabilities,
            healthStatus: 'healthy'
        });

        if (candidates.length === 0) {
            this.logger.warn(`No healthy agents found with capabilities: ${requiredCapabilities.join(', ')}`);
            return null;
        }

        return this.selectByStrategy(candidates, strategy, requiredCapabilities);
    }

    /**
     * Get agent by ID
     */
    public async getAgent(agentId: string): Promise<AgentRegistration | null> {
        // Check memory cache first
        let agent = this.agents.get(agentId);
        
        if (!agent) {
            // Check Redis
            const agentData = await this.redis.hget(this.registryKey, agentId);
            if (agentData) {
                agent = JSON.parse(agentData);
                this.agents.set(agentId, agent!);
            }
        }

        return agent || null;
    }

    /**
     * Get all registered agents
     */
    public async getAllAgents(): Promise<AgentRegistration[]> {
        await this.syncFromRedis();
        return Array.from(this.agents.values());
    }

    /**
     * Update agent health status
     */
    public async updateAgentHealth(agentId: string, health: HealthCheckResult): Promise<void> {
        try {
            const agent = await this.getAgent(agentId);
            if (!agent) {
                this.logger.warn(`Attempted to update health for unknown agent: ${agentId}`);
                return;
            }

            agent.health = {
                status: health.status,
                lastCheck: health.timestamp,
                details: health.details
            };
            agent.lastSeen = new Date();

            // Update in memory
            this.agents.set(agentId, agent);

            // Update in Redis
            await this.redis.hset(this.registryKey, agentId, JSON.stringify(agent));
            await this.redis.hset(this.healthKey, agentId, JSON.stringify(health));

            this.emit('agentHealthUpdated', agent, health);

        } catch (error) {
            this.logger.error(`Failed to update health for agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Get registry statistics
     */
    public async getStats(): Promise<{
        totalAgents: number;
        healthyAgents: number;
        degradedAgents: number;
        unhealthyAgents: number;
        capabilityCounts: Record<string, number>;
        typeCounts: Record<string, number>;
    }> {
        await this.syncFromRedis();
        const agents = Array.from(this.agents.values());

        const stats = {
            totalAgents: agents.length,
            healthyAgents: agents.filter(a => a.health.status === 'healthy').length,
            degradedAgents: agents.filter(a => a.health.status === 'degraded').length,
            unhealthyAgents: agents.filter(a => a.health.status === 'unhealthy').length,
            capabilityCounts: {} as Record<string, number>,
            typeCounts: {} as Record<string, number>
        };

        // Count capabilities
        agents.forEach(agent => {
            agent.capabilities.forEach(cap => {
                stats.capabilityCounts[cap] = (stats.capabilityCounts[cap] || 0) + 1;
            });
            stats.typeCounts[agent.type] = (stats.typeCounts[agent.type] || 0) + 1;
        });

        return stats;
    }

    /**
     * Clean up stale agent registrations
     */
    public async cleanup(): Promise<void> {
        try {
            const now = Date.now();
            const staleThreshold = 5 * 60 * 1000; // 5 minutes
            const staleAgents: string[] = [];

            for (const [id, agent] of this.agents) {
                if (now - agent.lastSeen.getTime() > staleThreshold) {
                    staleAgents.push(id);
                }
            }

            for (const agentId of staleAgents) {
                await this.deregisterAgent(agentId);
                this.logger.info(`Cleaned up stale agent: ${agentId}`);
            }

        } catch (error) {
            this.logger.error('Failed to cleanup stale agents:', error);
        }
    }

    // Private methods
    private getAgentType(agent: AgentInterface): string {
        return agent.constructor.name.replace('Agent', '').toLowerCase();
    }

    private calculateCapabilityScore(agent: AgentRegistration, requiredCapabilities: AgentCapability[]): number {
        const matches = agent.capabilities.filter(cap => requiredCapabilities.includes(cap)).length;
        return matches / requiredCapabilities.length;
    }

    private selectByStrategy(
        candidates: AgentRegistration[],
        strategy: LoadBalancingStrategy,
        requiredCapabilities: AgentCapability[]
    ): AgentRegistration {
        
        switch (strategy) {
            case LoadBalancingStrategy.CAPABILITY_MATCH:
                return candidates[0]; // Already sorted by capability match
                
            case LoadBalancingStrategy.RANDOM:
                return candidates[Math.floor(Math.random() * candidates.length)];
                
            case LoadBalancingStrategy.ROUND_ROBIN:
                // Simple round-robin implementation
                const lastSelected = this.getLastSelectedIndex(requiredCapabilities);
                const nextIndex = (lastSelected + 1) % candidates.length;
                this.setLastSelectedIndex(requiredCapabilities, nextIndex);
                return candidates[nextIndex];
                
            default:
                return candidates[0];
        }
    }

    private getLastSelectedIndex(capabilities: AgentCapability[]): number {
        // Simple implementation - could be enhanced with Redis storage
        return 0;
    }

    private setLastSelectedIndex(capabilities: AgentCapability[], index: number): void {
        // Simple implementation - could be enhanced with Redis storage
    }

    private async syncFromRedis(): Promise<void> {
        try {
            const agentData = await this.redis.hgetall(this.registryKey);
            
            for (const [id, data] of Object.entries(agentData)) {
                try {
                    const agent = JSON.parse(data);
                    this.agents.set(id, agent);
                } catch (error) {
                    this.logger.error(`Failed to parse agent data for ${id}:`, error);
                }
            }
        } catch (error) {
            this.logger.error('Failed to sync agents from Redis:', error);
        }
    }

    private startHealthMonitoring(): void {
        // Monitor agent health every 60 seconds
        this.healthCheckInterval = setInterval(async () => {
            await this.cleanup();
        }, 60000);
    }

    public async shutdown(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.removeAllListeners();
        await this.redis.quit();
    }
}

export default AgentRegistry;