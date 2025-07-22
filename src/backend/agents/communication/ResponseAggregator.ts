import { EventEmitter } from 'events';
import { Logger } from '../../infrastructure/logging/logger';
import { TaskResult, TaskRequest } from '../core/types';

/**
 * Response aggregator for combining results from multiple agents
 * Handles parallel processing, result merging, and consensus building
 */
export interface AggregationConfig {
    strategy: 'merge' | 'consensus' | 'first_success' | 'majority_vote' | 'weighted_average';
    timeout: number;
    minResponses: number;
    maxResponses?: number;
    weights?: Record<string, number>; // Agent weights for weighted strategies
    consensusThreshold?: number; // For consensus strategies (0.0-1.0)
}

export interface AggregationTask {
    id: string;
    originalRequest: TaskRequest;
    config: AggregationConfig;
    responses: Map<string, TaskResult>;
    startTime: number;
    expectedAgents: string[];
    status: 'pending' | 'completed' | 'timeout' | 'error';
}

export class ResponseAggregator extends EventEmitter {
    private readonly logger: Logger;
    private readonly activeTasks: Map<string, AggregationTask> = new Map();
    private readonly timeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(logger?: Logger) {
        super();
        this.logger = logger || new Logger('ResponseAggregator');
    }

    /**
     * Start aggregation for a task with multiple agents
     */
    public async startAggregation(
        taskId: string,
        originalRequest: TaskRequest,
        expectedAgents: string[],
        config: AggregationConfig
    ): Promise<void> {
        
        try {
            this.logger.info(`Starting aggregation for task ${taskId} with ${expectedAgents.length} agents`);

            const task: AggregationTask = {
                id: taskId,
                originalRequest,
                config,
                responses: new Map(),
                startTime: Date.now(),
                expectedAgents: [...expectedAgents],
                status: 'pending'
            };

            this.activeTasks.set(taskId, task);

            // Set timeout
            const timeoutHandle = setTimeout(() => {
                this.handleTimeout(taskId);
            }, config.timeout);

            this.timeouts.set(taskId, timeoutHandle);

            this.emit('aggregationStarted', task);

        } catch (error) {
            this.logger.error(`Failed to start aggregation for task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Add a response from an agent
     */
    public async addResponse(taskId: string, agentId: string, response: TaskResult): Promise<void> {
        try {
            const task = this.activeTasks.get(taskId);
            
            if (!task) {
                this.logger.warn(`Received response for unknown aggregation task: ${taskId}`);
                return;
            }

            if (task.status !== 'pending') {
                this.logger.warn(`Received response for completed task: ${taskId}`);
                return;
            }

            // Validate agent is expected
            if (!task.expectedAgents.includes(agentId)) {
                this.logger.warn(`Received response from unexpected agent ${agentId} for task ${taskId}`);
                return;
            }

            // Add response
            task.responses.set(agentId, response);

            this.logger.debug(`Response received from agent ${agentId} for task ${taskId} (${task.responses.size}/${task.expectedAgents.length})`);
            this.emit('responseReceived', taskId, agentId, response);

            // Check if we should complete aggregation
            await this.checkCompletionConditions(task);

        } catch (error) {
            this.logger.error(`Failed to add response for task ${taskId}:`, error);
        }
    }

    /**
     * Get aggregated result for a task
     */
    public async getAggregatedResult(taskId: string): Promise<TaskResult | null> {
        const task = this.activeTasks.get(taskId);
        
        if (!task || task.status === 'pending') {
            return null;
        }

        return await this.aggregateResponses(task);
    }

    /**
     * Check status of aggregation task
     */
    public getTaskStatus(taskId: string): {
        status: string;
        responsesReceived: number;
        expectedResponses: number;
        elapsedTime: number;
    } | null {
        
        const task = this.activeTasks.get(taskId);
        
        if (!task) {
            return null;
        }

        return {
            status: task.status,
            responsesReceived: task.responses.size,
            expectedResponses: task.expectedAgents.length,
            elapsedTime: Date.now() - task.startTime
        };
    }

    /**
     * Cancel an active aggregation
     */
    public async cancelAggregation(taskId: string): Promise<void> {
        const task = this.activeTasks.get(taskId);
        
        if (!task) {
            return;
        }

        task.status = 'error';

        // Clear timeout
        const timeoutHandle = this.timeouts.get(taskId);
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            this.timeouts.delete(taskId);
        }

        this.activeTasks.delete(taskId);

        this.logger.info(`Aggregation cancelled for task ${taskId}`);
        this.emit('aggregationCancelled', taskId);
    }

    /**
     * Get statistics about active aggregations
     */
    public getStats(): {
        activeTasks: number;
        completedTasks: number;
        timedOutTasks: number;
        errorTasks: number;
        averageResponseTime: number;
    } {
        
        const active = Array.from(this.activeTasks.values()).filter(t => t.status === 'pending').length;
        const completed = Array.from(this.activeTasks.values()).filter(t => t.status === 'completed').length;
        const timedOut = Array.from(this.activeTasks.values()).filter(t => t.status === 'timeout').length;
        const error = Array.from(this.activeTasks.values()).filter(t => t.status === 'error').length;
        
        // Calculate average response time for completed tasks
        const completedTasks = Array.from(this.activeTasks.values()).filter(t => t.status === 'completed');
        const averageResponseTime = completedTasks.length > 0
            ? completedTasks.reduce((sum, task) => sum + (Date.now() - task.startTime), 0) / completedTasks.length
            : 0;

        return {
            activeTasks: active,
            completedTasks: completed,
            timedOutTasks: timedOut,
            errorTasks: error,
            averageResponseTime
        };
    }

    // Private methods
    private async checkCompletionConditions(task: AggregationTask): Promise<void> {
        const config = task.config;
        const responseCount = task.responses.size;

        let shouldComplete = false;

        switch (config.strategy) {
            case 'first_success':
                shouldComplete = responseCount >= 1 && this.hasSuccessfulResponse(task);
                break;
                
            case 'merge':
            case 'consensus':
            case 'weighted_average':
                shouldComplete = responseCount >= config.minResponses;
                break;
                
            case 'majority_vote':
                const majority = Math.floor(task.expectedAgents.length / 2) + 1;
                shouldComplete = responseCount >= Math.max(config.minResponses, majority);
                break;
                
            default:
                shouldComplete = responseCount >= config.minResponses;
        }

        // Also complete if we have all expected responses
        if (responseCount >= task.expectedAgents.length) {
            shouldComplete = true;
        }

        if (shouldComplete) {
            await this.completeAggregation(task);
        }
    }

    private async completeAggregation(task: AggregationTask): Promise<void> {
        try {
            task.status = 'completed';

            // Clear timeout
            const timeoutHandle = this.timeouts.get(task.id);
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                this.timeouts.delete(task.id);
            }

            const aggregatedResult = await this.aggregateResponses(task);

            this.logger.info(`Aggregation completed for task ${task.id} with ${task.responses.size} responses`);
            this.emit('aggregationCompleted', task.id, aggregatedResult);

            // Keep task for a while for result retrieval
            setTimeout(() => {
                this.activeTasks.delete(task.id);
            }, 60000); // Keep for 1 minute

        } catch (error) {
            this.logger.error(`Failed to complete aggregation for task ${task.id}:`, error);
            task.status = 'error';
        }
    }

    private async aggregateResponses(task: AggregationTask): Promise<TaskResult> {
        const responses = Array.from(task.responses.values());
        const config = task.config;

        switch (config.strategy) {
            case 'first_success':
                return this.aggregateFirstSuccess(task, responses);
                
            case 'merge':
                return this.aggregateMerge(task, responses);
                
            case 'consensus':
                return this.aggregateConsensus(task, responses, config.consensusThreshold || 0.7);
                
            case 'majority_vote':
                return this.aggregateMajorityVote(task, responses);
                
            case 'weighted_average':
                return this.aggregateWeightedAverage(task, responses, config.weights || {});
                
            default:
                return this.aggregateMerge(task, responses);
        }
    }

    private aggregateFirstSuccess(task: AggregationTask, responses: TaskResult[]): TaskResult {
        const successfulResponse = responses.find(r => r.success);
        
        if (successfulResponse) {
            return successfulResponse;
        }

        // Return first response if no successful ones
        return responses[0] || {
            taskId: task.id,
            success: false,
            error: 'No successful responses received',
            processingTime: Date.now() - task.startTime,
            completedAt: new Date(),
            agentId: 'aggregator'
        };
    }

    private aggregateMerge(task: AggregationTask, responses: TaskResult[]): TaskResult {
        const successfulResponses = responses.filter(r => r.success);
        
        if (successfulResponses.length === 0) {
            return {
                taskId: task.id,
                success: false,
                error: 'All agent responses failed',
                processingTime: Date.now() - task.startTime,
                completedAt: new Date(),
                agentId: 'aggregator'
            };
        }

        // Merge data from successful responses
        const mergedData = this.mergeResponseData(successfulResponses.map(r => r.data));
        
        return {
            taskId: task.id,
            success: true,
            data: mergedData,
            processingTime: Date.now() - task.startTime,
            completedAt: new Date(),
            agentId: 'aggregator',
            metadata: {
                strategy: 'merge',
                responseCount: successfulResponses.length,
                agentIds: successfulResponses.map(r => r.agentId)
            }
        };
    }

    private aggregateConsensus(task: AggregationTask, responses: TaskResult[], threshold: number): TaskResult {
        const successfulResponses = responses.filter(r => r.success);
        
        if (successfulResponses.length === 0) {
            return this.createErrorResult(task, 'No successful responses for consensus');
        }

        // Group responses by similarity (simplified)
        const consensusGroup = this.findConsensusGroup(successfulResponses, threshold);
        
        if (consensusGroup.length === 0) {
            return this.createErrorResult(task, 'No consensus reached');
        }

        const mergedData = this.mergeResponseData(consensusGroup.map(r => r.data));
        
        return {
            taskId: task.id,
            success: true,
            data: mergedData,
            processingTime: Date.now() - task.startTime,
            completedAt: new Date(),
            agentId: 'aggregator',
            metadata: {
                strategy: 'consensus',
                consensusSize: consensusGroup.length,
                totalResponses: successfulResponses.length,
                consensusRatio: consensusGroup.length / successfulResponses.length
            }
        };
    }

    private aggregateMajorityVote(task: AggregationTask, responses: TaskResult[]): TaskResult {
        const successfulResponses = responses.filter(r => r.success);
        
        if (successfulResponses.length === 0) {
            return this.createErrorResult(task, 'No successful responses for majority vote');
        }

        // Find majority result (simplified by comparing result data)
        const resultCounts = new Map<string, TaskResult[]>();
        
        for (const response of successfulResponses) {
            const resultKey = this.getResultKey(response.data);
            if (!resultCounts.has(resultKey)) {
                resultCounts.set(resultKey, []);
            }
            resultCounts.get(resultKey)!.push(response);
        }

        // Find majority
        let majorityGroup: TaskResult[] = [];
        let maxCount = 0;

        for (const [key, group] of resultCounts) {
            if (group.length > maxCount) {
                maxCount = group.length;
                majorityGroup = group;
            }
        }

        const majority = Math.floor(successfulResponses.length / 2) + 1;
        
        if (maxCount < majority) {
            return this.createErrorResult(task, 'No majority consensus reached');
        }

        return {
            taskId: task.id,
            success: true,
            data: majorityGroup[0].data, // Use first result from majority group
            processingTime: Date.now() - task.startTime,
            completedAt: new Date(),
            agentId: 'aggregator',
            metadata: {
                strategy: 'majority_vote',
                majoritySize: maxCount,
                totalResponses: successfulResponses.length,
                majorityRatio: maxCount / successfulResponses.length
            }
        };
    }

    private aggregateWeightedAverage(
        task: AggregationTask, 
        responses: TaskResult[], 
        weights: Record<string, number>
    ): TaskResult {
        
        const successfulResponses = responses.filter(r => r.success);
        
        if (successfulResponses.length === 0) {
            return this.createErrorResult(task, 'No successful responses for weighted average');
        }

        // Calculate weighted average (simplified for numeric results)
        const weightedResults = successfulResponses.map(response => {
            const weight = weights[response.agentId] || 1.0;
            return {
                result: response,
                weight,
                value: this.extractNumericValue(response.data)
            };
        });

        const totalWeight = weightedResults.reduce((sum, wr) => sum + wr.weight, 0);
        const weightedSum = weightedResults.reduce((sum, wr) => sum + (wr.value * wr.weight), 0);
        
        const averageValue = totalWeight > 0 ? weightedSum / totalWeight : 0;

        return {
            taskId: task.id,
            success: true,
            data: { value: averageValue, confidence: totalWeight / successfulResponses.length },
            processingTime: Date.now() - task.startTime,
            completedAt: new Date(),
            agentId: 'aggregator',
            metadata: {
                strategy: 'weighted_average',
                responseCount: successfulResponses.length,
                totalWeight,
                weights: weights
            }
        };
    }

    private handleTimeout(taskId: string): void {
        const task = this.activeTasks.get(taskId);
        
        if (!task || task.status !== 'pending') {
            return;
        }

        task.status = 'timeout';
        this.timeouts.delete(taskId);

        this.logger.warn(`Aggregation timeout for task ${taskId} with ${task.responses.size}/${task.expectedAgents.length} responses`);
        this.emit('aggregationTimeout', taskId);

        // If we have minimum responses, try to complete
        if (task.responses.size >= task.config.minResponses) {
            this.completeAggregation(task);
        }
    }

    private hasSuccessfulResponse(task: AggregationTask): boolean {
        return Array.from(task.responses.values()).some(r => r.success);
    }

    private mergeResponseData(dataArray: any[]): any {
        // Simplified merge - in practice, this would be more sophisticated
        if (dataArray.length === 0) return null;
        if (dataArray.length === 1) return dataArray[0];

        // If all data are objects, merge them
        if (dataArray.every(d => typeof d === 'object' && d !== null)) {
            return dataArray.reduce((merged, data) => ({ ...merged, ...data }), {});
        }

        // If all data are arrays, concatenate them
        if (dataArray.every(d => Array.isArray(d))) {
            return dataArray.flat();
        }

        // Otherwise, return array of all data
        return dataArray;
    }

    private findConsensusGroup(responses: TaskResult[], threshold: number): TaskResult[] {
        // Simplified consensus finding - in practice, would use more sophisticated similarity measures
        const responseGroups = new Map<string, TaskResult[]>();
        
        for (const response of responses) {
            const key = this.getResultKey(response.data);
            if (!responseGroups.has(key)) {
                responseGroups.set(key, []);
            }
            responseGroups.get(key)!.push(response);
        }

        // Find largest group that meets threshold
        for (const [key, group] of responseGroups) {
            if (group.length / responses.length >= threshold) {
                return group;
            }
        }

        return [];
    }

    private getResultKey(data: any): string {
        // Simplified result comparison - create key for grouping similar results
        if (typeof data === 'string' || typeof data === 'number') {
            return String(data);
        }
        
        if (typeof data === 'object') {
            return JSON.stringify(data);
        }
        
        return String(data);
    }

    private extractNumericValue(data: any): number {
        if (typeof data === 'number') {
            return data;
        }
        
        if (typeof data === 'object' && data.value !== undefined) {
            return Number(data.value) || 0;
        }
        
        return 0;
    }

    private createErrorResult(task: AggregationTask, error: string): TaskResult {
        return {
            taskId: task.id,
            success: false,
            error,
            processingTime: Date.now() - task.startTime,
            completedAt: new Date(),
            agentId: 'aggregator'
        };
    }
}

export default ResponseAggregator;