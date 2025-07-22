import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../../infrastructure/logging/logger';
import { AgentConfig } from '../core/types';

/**
 * Configuration manager for agent settings and system configuration
 */
export class ConfigurationManager extends EventEmitter {
    private readonly redis: Redis;
    private readonly logger: Logger;
    private readonly configKey = 'agents:config';
    private readonly schemaKey = 'agents:schema';
    private readonly configCache: Map<string, any> = new Map();

    constructor(redis: Redis, logger?: Logger) {
        super();
        this.redis = redis;
        this.logger = logger || new Logger('ConfigurationManager');
    }

    /**
     * Get configuration for an agent
     */
    public async getAgentConfig(agentId: string): Promise<AgentConfig | null> {
        try {
            // Check cache first
            if (this.configCache.has(agentId)) {
                return this.configCache.get(agentId);
            }

            // Get from Redis
            const configData = await this.redis.hget(this.configKey, agentId);
            if (configData) {
                const config = JSON.parse(configData);
                this.configCache.set(agentId, config);
                return config;
            }

            return null;

        } catch (error) {
            this.logger.error(`Failed to get config for agent ${agentId}:`, error);
            return null;
        }
    }

    /**
     * Set configuration for an agent
     */
    public async setAgentConfig(agentId: string, config: AgentConfig): Promise<void> {
        try {
            // Validate configuration
            await this.validateConfig(config);

            // Store in Redis
            await this.redis.hset(this.configKey, agentId, JSON.stringify(config));

            // Update cache
            this.configCache.set(agentId, config);

            this.logger.info(`Configuration updated for agent ${agentId}`);
            this.emit('configUpdated', agentId, config);

        } catch (error) {
            this.logger.error(`Failed to set config for agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Remove configuration for an agent
     */
    public async removeAgentConfig(agentId: string): Promise<void> {
        try {
            await this.redis.hdel(this.configKey, agentId);
            this.configCache.delete(agentId);

            this.logger.info(`Configuration removed for agent ${agentId}`);
            this.emit('configRemoved', agentId);

        } catch (error) {
            this.logger.error(`Failed to remove config for agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Get all agent configurations
     */
    public async getAllConfigs(): Promise<Record<string, AgentConfig>> {
        try {
            const configs = await this.redis.hgetall(this.configKey);
            const result: Record<string, AgentConfig> = {};

            for (const [agentId, configData] of Object.entries(configs)) {
                try {
                    result[agentId] = JSON.parse(configData);
                } catch (parseError) {
                    this.logger.error(`Failed to parse config for agent ${agentId}:`, parseError);
                }
            }

            return result;

        } catch (error) {
            this.logger.error('Failed to get all configs:', error);
            return {};
        }
    }

    /**
     * Update specific configuration field
     */
    public async updateConfigField(
        agentId: string, 
        field: string, 
        value: any
    ): Promise<void> {
        
        try {
            const config = await this.getAgentConfig(agentId);
            if (!config) {
                throw new Error(`No configuration found for agent ${agentId}`);
            }

            // Update field
            const updatedConfig = { ...config, [field]: value };

            // Validate and save
            await this.setAgentConfig(agentId, updatedConfig);

        } catch (error) {
            this.logger.error(`Failed to update config field ${field} for agent ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Bulk update configurations
     */
    public async bulkUpdateConfigs(updates: Record<string, Partial<AgentConfig>>): Promise<{
        successful: string[];
        failed: Array<{ agentId: string; error: string }>;
    }> {
        
        const successful: string[] = [];
        const failed: Array<{ agentId: string; error: string }> = [];

        for (const [agentId, updates] of Object.entries(updates)) {
            try {
                const currentConfig = await this.getAgentConfig(agentId);
                if (!currentConfig) {
                    failed.push({ agentId, error: 'Configuration not found' });
                    continue;
                }

                const updatedConfig = { ...currentConfig, ...updates };
                await this.setAgentConfig(agentId, updatedConfig);
                successful.push(agentId);

            } catch (error) {
                failed.push({ 
                    agentId, 
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        this.logger.info(`Bulk update completed: ${successful.length} successful, ${failed.length} failed`);
        return { successful, failed };
    }

    /**
     * Set default configuration template
     */
    public async setConfigTemplate(agentType: string, template: Partial<AgentConfig>): Promise<void> {
        try {
            const templateKey = `${this.configKey}:templates`;
            await this.redis.hset(templateKey, agentType, JSON.stringify(template));

            this.logger.info(`Configuration template set for agent type: ${agentType}`);
            this.emit('templateSet', agentType, template);

        } catch (error) {
            this.logger.error(`Failed to set template for agent type ${agentType}:`, error);
            throw error;
        }
    }

    /**
     * Get configuration template
     */
    public async getConfigTemplate(agentType: string): Promise<Partial<AgentConfig> | null> {
        try {
            const templateKey = `${this.configKey}:templates`;
            const templateData = await this.redis.hget(templateKey, agentType);
            
            return templateData ? JSON.parse(templateData) : null;

        } catch (error) {
            this.logger.error(`Failed to get template for agent type ${agentType}:`, error);
            return null;
        }
    }

    /**
     * Create configuration from template
     */
    public async createFromTemplate(
        agentId: string,
        agentType: string,
        overrides: Partial<AgentConfig> = {}
    ): Promise<AgentConfig> {
        
        try {
            const template = await this.getConfigTemplate(agentType);
            if (!template) {
                throw new Error(`No template found for agent type: ${agentType}`);
            }

            const config: AgentConfig = {
                id: agentId,
                name: agentId,
                type: agentType,
                capabilities: [],
                ...template,
                ...overrides
            };

            await this.setAgentConfig(agentId, config);
            return config;

        } catch (error) {
            this.logger.error(`Failed to create config from template for ${agentId}:`, error);
            throw error;
        }
    }

    /**
     * Validate configuration against schema
     */
    public async validateConfig(config: AgentConfig): Promise<void> {
        try {
            // Basic validation
            if (!config.id || !config.name || !config.type) {
                throw new Error('Configuration must include id, name, and type');
            }

            // Type-specific validation
            const schema = await this.getSchema(config.type);
            if (schema) {
                this.validateAgainstSchema(config, schema);
            }

        } catch (error) {
            this.logger.error('Configuration validation failed:', error);
            throw error;
        }
    }

    /**
     * Set configuration schema for agent type
     */
    public async setSchema(agentType: string, schema: any): Promise<void> {
        try {
            await this.redis.hset(this.schemaKey, agentType, JSON.stringify(schema));
            this.logger.info(`Schema set for agent type: ${agentType}`);

        } catch (error) {
            this.logger.error(`Failed to set schema for agent type ${agentType}:`, error);
            throw error;
        }
    }

    /**
     * Get configuration schema for agent type
     */
    public async getSchema(agentType: string): Promise<any | null> {
        try {
            const schemaData = await this.redis.hget(this.schemaKey, agentType);
            return schemaData ? JSON.parse(schemaData) : null;

        } catch (error) {
            this.logger.error(`Failed to get schema for agent type ${agentType}:`, error);
            return null;
        }
    }

    /**
     * Get configuration history for an agent
     */
    public async getConfigHistory(agentId: string): Promise<Array<{
        config: AgentConfig;
        timestamp: Date;
        version: number;
    }>> {
        
        try {
            const historyKey = `${this.configKey}:history:${agentId}`;
            const historyData = await this.redis.lrange(historyKey, 0, 50);

            return historyData.map((data, index) => {
                const parsed = JSON.parse(data);
                return {
                    config: parsed.config,
                    timestamp: new Date(parsed.timestamp),
                    version: parsed.version || (historyData.length - index)
                };
            });

        } catch (error) {
            this.logger.error(`Failed to get config history for agent ${agentId}:`, error);
            return [];
        }
    }

    /**
     * Rollback to previous configuration
     */
    public async rollbackConfig(agentId: string, version: number): Promise<void> {
        try {
            const history = await this.getConfigHistory(agentId);
            const targetVersion = history.find(h => h.version === version);

            if (!targetVersion) {
                throw new Error(`Version ${version} not found in history for agent ${agentId}`);
            }

            await this.setAgentConfig(agentId, targetVersion.config);
            
            this.logger.info(`Rolled back configuration for agent ${agentId} to version ${version}`);
            this.emit('configRolledBack', agentId, version);

        } catch (error) {
            this.logger.error(`Failed to rollback config for agent ${agentId}:`, error);
            throw error;
        }
    }

    // Private methods
    private validateAgainstSchema(config: AgentConfig, schema: any): void {
        // Simple schema validation - in production, use a proper JSON schema validator
        for (const [field, rules] of Object.entries(schema)) {
            if (rules && typeof rules === 'object') {
                const value = (config as any)[field];
                
                if ((rules as any).required && !value) {
                    throw new Error(`Required field '${field}' is missing`);
                }
                
                if (value && (rules as any).type && typeof value !== (rules as any).type) {
                    throw new Error(`Field '${field}' must be of type ${(rules as any).type}`);
                }
                
                if (value && (rules as any).enum && !(rules as any).enum.includes(value)) {
                    throw new Error(`Field '${field}' must be one of: ${(rules as any).enum.join(', ')}`);
                }
            }
        }
    }

    private async storeConfigHistory(agentId: string, config: AgentConfig): Promise<void> {
        try {
            const historyKey = `${this.configKey}:history:${agentId}`;
            const historyEntry = JSON.stringify({
                config,
                timestamp: new Date().toISOString(),
                version: Date.now()
            });

            await this.redis.lpush(historyKey, historyEntry);
            await this.redis.ltrim(historyKey, 0, 49); // Keep only last 50 versions

        } catch (error) {
            this.logger.error(`Failed to store config history for agent ${agentId}:`, error);
        }
    }
}

export default ConfigurationManager;