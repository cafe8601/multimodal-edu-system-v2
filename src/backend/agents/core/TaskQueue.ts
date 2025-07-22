import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../infrastructure/logging/logger';
import { TaskRequest, TaskResult, TaskPriority, AgentCapability } from './types';

/**
 * Distributed task queue for agent task distribution
 * Handles priority queuing, task routing, and result collection
 */
export class TaskQueue extends EventEmitter {
    private readonly redis: Redis;
    private readonly logger: Logger;
    private readonly queuePrefix = 'tasks:queue';
    private readonly processingPrefix = 'tasks:processing';
    private readonly resultsPrefix = 'tasks:results';
    private readonly deadLetterPrefix = 'tasks:deadletter';
    
    private processingTasks: Map<string, TaskRequest> = new Map();
    private isShutdown = false;

    constructor(redis: Redis, logger?: Logger) {
        super();
        this.redis = redis;
        this.logger = logger || new Logger('TaskQueue');
    }

    /**
     * Add a task to the queue
     */
    public async enqueueTask(task: TaskRequest): Promise<void> {
        try {
            const queueKey = this.getQueueKey(task.priority);
            const taskData = JSON.stringify(task);
            
            // Add task to priority queue
            await this.redis.lpush(queueKey, taskData);
            
            // Set task metadata
            await this.redis.hset(`${this.queuePrefix}:metadata`, task.id, JSON.stringify({
                enqueuedAt: new Date(),
                priority: task.priority,
                capabilities: task.requiredCapabilities,
                timeout: task.timeout || 30000
            }));

            this.logger.info(`Task ${task.id} enqueued with priority ${task.priority}`);
            this.emit('taskEnqueued', task);
            
        } catch (error) {
            this.logger.error(`Failed to enqueue task ${task.id}:`, error);
            throw error;
        }
    }

    /**
     * Dequeue the next available task
     */
    public async dequeueTask(
        requiredCapabilities?: AgentCapability[],
        agentId?: string
    ): Promise<TaskRequest | null> {
        
        if (this.isShutdown) {
            return null;
        }

        try {
            // Check priority queues in order (critical -> high -> medium -> low)
            const priorities = [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW];
            
            for (const priority of priorities) {
                const queueKey = this.getQueueKey(priority);
                const taskData = await this.redis.rpop(queueKey);
                
                if (taskData) {
                    const task = JSON.parse(taskData) as TaskRequest;
                    
                    // Check if agent has required capabilities
                    if (requiredCapabilities && !this.hasRequiredCapabilities(task, requiredCapabilities)) {
                        // Put task back at the front of the queue
                        await this.redis.rpush(queueKey, taskData);
                        continue;
                    }
                    
                    // Move task to processing queue
                    await this.redis.hset(`${this.processingPrefix}:${agentId || 'unknown'}`, task.id, JSON.stringify({
                        task,
                        startTime: Date.now(),
                        agentId
                    }));
                    
                    this.processingTasks.set(task.id, task);
                    
                    this.logger.info(`Task ${task.id} dequeued by agent ${agentId || 'unknown'}`);
                    this.emit('taskDequeued', task, agentId);
                    
                    return task;
                }
            }
            
            return null; // No tasks available
            
        } catch (error) {
            this.logger.error('Failed to dequeue task:', error);
            throw error;
        }
    }

    /**
     * Complete a task and store result
     */
    public async completeTask(taskId: string, result: TaskResult, agentId?: string): Promise<void> {
        try {
            // Remove from processing queue
            await this.redis.hdel(`${this.processingPrefix}:${agentId || 'unknown'}`, taskId);
            this.processingTasks.delete(taskId);
            
            // Store result
            await this.redis.hset(this.resultsPrefix, taskId, JSON.stringify(result));
            
            // Set result TTL (24 hours)
            await this.redis.expire(`${this.resultsPrefix}:${taskId}`, 24 * 60 * 60);
            
            // Clean up task metadata
            await this.redis.hdel(`${this.queuePrefix}:metadata`, taskId);
            
            this.logger.info(`Task ${taskId} completed by agent ${agentId || 'unknown'}`);
            this.emit('taskCompleted', taskId, result);
            
        } catch (error) {
            this.logger.error(`Failed to complete task ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Mark task as failed and optionally retry
     */
    public async failTask(
        taskId: string, 
        error: Error, 
        agentId?: string,
        retry: boolean = true
    ): Promise<void> {
        
        try {
            const processingKey = `${this.processingPrefix}:${agentId || 'unknown'}`;
            const processingData = await this.redis.hget(processingKey, taskId);
            
            if (!processingData) {
                this.logger.warn(`Task ${taskId} not found in processing queue`);
                return;
            }
            
            const { task } = JSON.parse(processingData);
            const currentRetryCount = task.retryCount || 0;
            const maxRetries = 3; // Could be configurable
            
            // Remove from processing queue
            await this.redis.hdel(processingKey, taskId);
            this.processingTasks.delete(taskId);
            
            if (retry && currentRetryCount < maxRetries) {
                // Increment retry count and re-enqueue
                task.retryCount = currentRetryCount + 1;
                await this.enqueueTask(task);
                
                this.logger.warn(`Task ${taskId} failed, retrying (${task.retryCount}/${maxRetries})`);
                this.emit('taskRetried', task, error);
                
            } else {
                // Move to dead letter queue
                await this.redis.lpush(this.deadLetterPrefix, JSON.stringify({
                    task,
                    error: error.message,
                    failedAt: new Date(),
                    agentId
                }));
                
                this.logger.error(`Task ${taskId} moved to dead letter queue after ${currentRetryCount} retries`);
                this.emit('taskFailed', task, error);
            }
            
        } catch (err) {
            this.logger.error(`Failed to handle task failure for ${taskId}:`, err);
            throw err;
        }
    }

    /**
     * Get task result
     */
    public async getTaskResult(taskId: string): Promise<TaskResult | null> {
        try {
            const resultData = await this.redis.hget(this.resultsPrefix, taskId);
            return resultData ? JSON.parse(resultData) : null;
        } catch (error) {
            this.logger.error(`Failed to get result for task ${taskId}:`, error);
            return null;
        }
    }

    /**
     * Get queue statistics
     */
    public async getStats(): Promise<{
        queued: Record<TaskPriority, number>;
        processing: number;
        completed: number;
        deadLettered: number;
    }> {
        
        try {
            const stats = {
                queued: {
                    [TaskPriority.CRITICAL]: await this.redis.llen(this.getQueueKey(TaskPriority.CRITICAL)),
                    [TaskPriority.HIGH]: await this.redis.llen(this.getQueueKey(TaskPriority.HIGH)),
                    [TaskPriority.MEDIUM]: await this.redis.llen(this.getQueueKey(TaskPriority.MEDIUM)),
                    [TaskPriority.LOW]: await this.redis.llen(this.getQueueKey(TaskPriority.LOW))
                },
                processing: this.processingTasks.size,
                completed: await this.redis.hlen(this.resultsPrefix),
                deadLettered: await this.redis.llen(this.deadLetterPrefix)
            };
            
            return stats;
            
        } catch (error) {
            this.logger.error('Failed to get queue stats:', error);
            throw error;
        }
    }

    /**
     * Get tasks in queue by priority
     */
    public async getQueuedTasks(priority: TaskPriority): Promise<TaskRequest[]> {
        try {
            const queueKey = this.getQueueKey(priority);
            const taskDataList = await this.redis.lrange(queueKey, 0, -1);
            
            return taskDataList.map(data => JSON.parse(data) as TaskRequest);
            
        } catch (error) {
            this.logger.error(`Failed to get queued tasks for priority ${priority}:`, error);
            return [];
        }
    }

    /**
     * Get currently processing tasks
     */
    public async getProcessingTasks(): Promise<{
        taskId: string;
        task: TaskRequest;
        agentId: string;
        startTime: number;
    }[]> {
        
        try {
            const processingTasks: any[] = [];
            const pattern = `${this.processingPrefix}:*`;
            const keys = await this.redis.keys(pattern);
            
            for (const key of keys) {
                const agentId = key.split(':').pop() || 'unknown';
                const tasks = await this.redis.hgetall(key);
                
                for (const [taskId, data] of Object.entries(tasks)) {
                    const processingData = JSON.parse(data);
                    processingTasks.push({
                        taskId,
                        task: processingData.task,
                        agentId: processingData.agentId || agentId,
                        startTime: processingData.startTime
                    });
                }
            }
            
            return processingTasks;
            
        } catch (error) {
            this.logger.error('Failed to get processing tasks:', error);
            return [];
        }
    }

    /**
     * Clean up expired tasks
     */
    public async cleanupExpiredTasks(): Promise<void> {
        try {
            const now = Date.now();
            const processingTasks = await this.getProcessingTasks();
            
            for (const { taskId, task, agentId, startTime } of processingTasks) {
                const taskTimeout = task.timeout || 30000;
                
                if (now - startTime > taskTimeout) {
                    this.logger.warn(`Task ${taskId} expired, moving to dead letter queue`);
                    
                    await this.failTask(
                        taskId, 
                        new Error('Task timeout'), 
                        agentId, 
                        false
                    );
                }
            }
            
        } catch (error) {
            this.logger.error('Failed to cleanup expired tasks:', error);
        }
    }

    /**
     * Purge all queues (use with caution)
     */
    public async purgeAllQueues(): Promise<void> {
        try {
            const priorities = [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW];
            
            for (const priority of priorities) {
                await this.redis.del(this.getQueueKey(priority));
            }
            
            await this.redis.del(this.resultsPrefix);
            await this.redis.del(this.deadLetterPrefix);
            await this.redis.del(`${this.queuePrefix}:metadata`);
            
            this.processingTasks.clear();
            
            this.logger.warn('All queues purged');
            this.emit('queuesPurged');
            
        } catch (error) {
            this.logger.error('Failed to purge queues:', error);
            throw error;
        }
    }

    /**
     * Shutdown the task queue
     */
    public async shutdown(): Promise<void> {
        this.isShutdown = true;
        this.removeAllListeners();
        
        // Optionally move processing tasks back to queue
        for (const [taskId, task] of this.processingTasks) {
            await this.enqueueTask(task);
            this.logger.info(`Moved processing task ${taskId} back to queue during shutdown`);
        }
        
        await this.redis.quit();
    }

    // Private helper methods
    private getQueueKey(priority: TaskPriority): string {
        return `${this.queuePrefix}:${priority}`;
    }

    private hasRequiredCapabilities(task: TaskRequest, agentCapabilities: AgentCapability[]): boolean {
        return task.requiredCapabilities.every(cap => agentCapabilities.includes(cap));
    }
}

export default TaskQueue;