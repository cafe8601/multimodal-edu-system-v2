import { EventEmitter } from 'events';
import { Logger } from '../../infrastructure/logging/logger';
import { AgentRegistry } from '../core/AgentRegistry';
import { TaskQueue } from '../core/TaskQueue';
import { 
    TaskRequest, 
    TaskResult, 
    LoadBalancingStrategy, 
    AgentRegistration,
    AgentCapability 
} from '../core/types';

/**
 * Load balancer for distributing tasks across available agents
 */
export class LoadBalancer extends EventEmitter {
    private readonly agentRegistry: AgentRegistry;
    private readonly taskQueue: TaskQueue;
    private readonly logger: Logger;
    
    // Load balancing state
    private roundRobinCounters: Map<string, number> = new Map();
    private agentLoads: Map<string, number> = new Map();
    private responseTimeHistory: Map<string, number[]> = new Map();

    constructor(
        agentRegistry: AgentRegistry,
        taskQueue: TaskQueue,
        logger?: Logger
    ) {
        super();
        this.agentRegistry = agentRegistry;
        this.taskQueue = taskQueue;
        this.logger = logger || new Logger('LoadBalancer');
    }

    /**
     * Distribute task to best available agent using specified strategy
     */
    public async distributeTask(
        task: TaskRequest,
        strategy: LoadBalancingStrategy = LoadBalancingStrategy.LEAST_CONNECTIONS
    ): Promise<string | null> {
        
        try {
            const availableAgents = await this.agentRegistry.discoverAgents({
                capabilities: task.requiredCapabilities,
                healthStatus: 'healthy'
            });

            if (availableAgents.length === 0) {
                this.logger.warn(`No available agents for task ${task.id}`);
                return null;
            }

            const selectedAgent = this.selectAgent(availableAgents, strategy, task);
            
            if (selectedAgent) {
                // Update load tracking
                this.incrementAgentLoad(selectedAgent.id);
                
                this.logger.info(`Task ${task.id} distributed to agent ${selectedAgent.id} using ${strategy}`);
                this.emit('taskDistributed', task.id, selectedAgent.id, strategy);
                
                return selectedAgent.id;
            }

            return null;

        } catch (error) {
            this.logger.error(`Failed to distribute task ${task.id}:`, error);
            throw error;
        }
    }

    /**
     * Update agent load after task completion
     */
    public async updateAgentLoad(agentId: string, responseTime: number, success: boolean): Promise<void> {
        try {
            // Decrement current load
            this.decrementAgentLoad(agentId);
            
            // Update response time history
            this.updateResponseTimeHistory(agentId, responseTime);
            
            this.emit('loadUpdated', agentId, this.agentLoads.get(agentId) || 0);

        } catch (error) {
            this.logger.error(`Failed to update load for agent ${agentId}:`, error);
        }
    }

    /**
     * Get current load statistics
     */
    public getLoadStats(): {
        totalLoad: number;
        agentLoads: Record<string, number>;
        averageResponseTimes: Record<string, number>;
        strategies: Record<string, number>;
    } {
        
        const totalLoad = Array.from(this.agentLoads.values()).reduce((sum, load) => sum + load, 0);
        const agentLoads = Object.fromEntries(this.agentLoads);
        
        const averageResponseTimes: Record<string, number> = {};
        for (const [agentId, times] of this.responseTimeHistory) {
            if (times.length > 0) {
                averageResponseTimes[agentId] = times.reduce((sum, time) => sum + time, 0) / times.length;
            }
        }

        return {
            totalLoad,
            agentLoads,
            averageResponseTimes,
            strategies: {} // Could track strategy usage statistics
        };
    }

    /**
     * Rebalance tasks across agents
     */
    public async rebalanceLoad(): Promise<{
        tasksRebalanced: number;
        fromAgent: string;
        toAgent: string;
    }[]> {
        
        try {
            const rebalanceActions: any[] = [];
            const stats = this.getLoadStats();
            
            // Find overloaded and underloaded agents
            const avgLoad = stats.totalLoad / Object.keys(stats.agentLoads).length;
            const overloadedAgents = Object.entries(stats.agentLoads)
                .filter(([_, load]) => load > avgLoad * 1.5)
                .map(([agentId]) => agentId);
                
            const underloadedAgents = Object.entries(stats.agentLoads)
                .filter(([_, load]) => load < avgLoad * 0.5)
                .map(([agentId]) => agentId);

            // Simple rebalancing logic
            for (let i = 0; i < Math.min(overloadedAgents.length, underloadedAgents.length); i++) {
                const fromAgent = overloadedAgents[i];
                const toAgent = underloadedAgents[i];
                
                // In a real implementation, you'd move actual queued tasks
                rebalanceActions.push({
                    tasksRebalanced: 1,
                    fromAgent,
                    toAgent
                });
                
                // Update loads
                this.decrementAgentLoad(fromAgent);
                this.incrementAgentLoad(toAgent);
            }

            if (rebalanceActions.length > 0) {
                this.logger.info(`Rebalanced load: ${rebalanceActions.length} actions taken`);
                this.emit('loadRebalanced', rebalanceActions);
            }

            return rebalanceActions;

        } catch (error) {
            this.logger.error('Failed to rebalance load:', error);
            return [];
        }
    }

    /**
     * Auto-scale agents based on load
     */
    public async autoScale(): Promise<{
        action: 'scale_up' | 'scale_down' | 'none';
        agentType?: string;
        count?: number;
    }> {
        
        try {
            const stats = this.getLoadStats();
            const totalAgents = Object.keys(stats.agentLoads).length;
            const avgLoad = stats.totalLoad / Math.max(totalAgents, 1);

            // Scale up if average load is high
            if (avgLoad > 5 && totalAgents < 20) {
                this.logger.info('High load detected, recommending scale up');
                this.emit('scaleRecommended', 'scale_up', avgLoad);
                
                return {
                    action: 'scale_up',
                    agentType: 'text_processing', // Could be more intelligent
                    count: Math.min(3, Math.ceil(avgLoad / 5))
                };
            }

            // Scale down if average load is very low
            if (avgLoad < 1 && totalAgents > 2) {
                this.logger.info('Low load detected, recommending scale down');
                this.emit('scaleRecommended', 'scale_down', avgLoad);
                
                return {
                    action: 'scale_down',
                    agentType: 'text_processing',
                    count: Math.floor(totalAgents / 4)
                };
            }

            return { action: 'none' };

        } catch (error) {
            this.logger.error('Failed to perform auto-scaling analysis:', error);
            return { action: 'none' };
        }
    }

    // Private methods
    private selectAgent(
        agents: AgentRegistration[], 
        strategy: LoadBalancingStrategy,
        task: TaskRequest
    ): AgentRegistration | null {
        
        switch (strategy) {
            case LoadBalancingStrategy.ROUND_ROBIN:
                return this.selectRoundRobin(agents, task);
                
            case LoadBalancingStrategy.LEAST_CONNECTIONS:
                return this.selectLeastConnections(agents);
                
            case LoadBalancingStrategy.RESPONSE_TIME:
                return this.selectByResponseTime(agents);
                
            case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
                return this.selectWeightedRoundRobin(agents);
                
            case LoadBalancingStrategy.CAPABILITY_MATCH:
                return this.selectByCapabilityMatch(agents, task);
                
            case LoadBalancingStrategy.RANDOM:
                return this.selectRandom(agents);
                
            default:
                return this.selectLeastConnections(agents);
        }
    }

    private selectRoundRobin(agents: AgentRegistration[], task: TaskRequest): AgentRegistration {
        const key = task.requiredCapabilities.join(',');
        const counter = this.roundRobinCounters.get(key) || 0;
        const selectedAgent = agents[counter % agents.length];
        this.roundRobinCounters.set(key, counter + 1);
        return selectedAgent;
    }

    private selectLeastConnections(agents: AgentRegistration[]): AgentRegistration {
        return agents.reduce((minAgent, agent) => {
            const currentLoad = this.agentLoads.get(agent.id) || 0;
            const minLoad = this.agentLoads.get(minAgent.id) || 0;
            return currentLoad < minLoad ? agent : minAgent;
        });
    }

    private selectByResponseTime(agents: AgentRegistration[]): AgentRegistration {
        return agents.reduce((fastest, agent) => {
            const currentTime = this.getAverageResponseTime(agent.id);
            const fastestTime = this.getAverageResponseTime(fastest.id);
            return currentTime < fastestTime ? agent : fastest;
        });
    }

    private selectWeightedRoundRobin(agents: AgentRegistration[]): AgentRegistration {
        // Simple implementation - could be enhanced with actual weights
        const weights = agents.map((agent, index) => ({
            agent,
            weight: 1 / (this.agentLoads.get(agent.id) || 0.1 + 1)
        }));
        
        const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const weightedAgent of weights) {
            random -= weightedAgent.weight;
            if (random <= 0) {
                return weightedAgent.agent;
            }
        }
        
        return agents[0];
    }

    private selectByCapabilityMatch(agents: AgentRegistration[], task: TaskRequest): AgentRegistration {
        const scores = agents.map(agent => {
            const matchingCaps = agent.capabilities.filter(cap => 
                task.requiredCapabilities.includes(cap)
            ).length;
            const matchScore = matchingCaps / task.requiredCapabilities.length;
            const loadScore = 1 / (this.agentLoads.get(agent.id) || 0.1 + 1);
            
            return {
                agent,
                score: matchScore * 0.7 + loadScore * 0.3
            };
        });
        
        scores.sort((a, b) => b.score - a.score);
        return scores[0].agent;
    }

    private selectRandom(agents: AgentRegistration[]): AgentRegistration {
        return agents[Math.floor(Math.random() * agents.length)];
    }

    private incrementAgentLoad(agentId: string): void {
        const currentLoad = this.agentLoads.get(agentId) || 0;
        this.agentLoads.set(agentId, currentLoad + 1);
    }

    private decrementAgentLoad(agentId: string): void {
        const currentLoad = this.agentLoads.get(agentId) || 0;
        this.agentLoads.set(agentId, Math.max(0, currentLoad - 1));
    }

    private updateResponseTimeHistory(agentId: string, responseTime: number): void {
        if (!this.responseTimeHistory.has(agentId)) {
            this.responseTimeHistory.set(agentId, []);
        }
        
        const history = this.responseTimeHistory.get(agentId)!;
        history.push(responseTime);
        
        // Keep only last 50 response times
        if (history.length > 50) {
            history.shift();
        }
    }

    private getAverageResponseTime(agentId: string): number {
        const history = this.responseTimeHistory.get(agentId);
        if (!history || history.length === 0) {
            return 1000; // Default response time
        }
        
        return history.reduce((sum, time) => sum + time, 0) / history.length;
    }
}

export default LoadBalancer;