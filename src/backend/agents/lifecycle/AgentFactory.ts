import { Logger } from '../../infrastructure/logging/logger';
import { AgentInterface } from '../core/AgentInterface';
import { AgentConfig, AgentCapability, AgentFactoryConfig } from '../core/types';
import { 
    TextProcessingAgent,
    VisionAnalyzerAgent,
    SpeechProcessingAgent,
    TutorAgent,
    AssessmentAgent
} from '../types';

/**
 * Factory for creating specialized agent instances
 * Handles agent instantiation, configuration, and dependency injection
 */
export class AgentFactory {
    private readonly logger: Logger;
    private readonly agentTypes: Map<string, AgentFactoryConfig> = new Map();
    private readonly dependencyRegistry: Map<string, any> = new Map();

    constructor(logger?: Logger) {
        this.logger = logger || new Logger('AgentFactory');
        this.registerBuiltInAgentTypes();
    }

    /**
     * Register a new agent type
     */
    public registerAgentType(agentType: string, config: AgentFactoryConfig): void {
        this.agentTypes.set(agentType, config);
        this.logger.info(`Agent type '${agentType}' registered`);
    }

    /**
     * Register a dependency for dependency injection
     */
    public registerDependency(name: string, instance: any): void {
        this.dependencyRegistry.set(name, instance);
        this.logger.debug(`Dependency '${name}' registered`);
    }

    /**
     * Create an agent instance
     */
    public async createAgent(config: AgentConfig): Promise<AgentInterface> {
        try {
            this.logger.info(`Creating agent: ${config.name} (${config.type})`);

            const factoryConfig = this.agentTypes.get(config.type);
            if (!factoryConfig) {
                throw new Error(`Unknown agent type: ${config.type}`);
            }

            // Validate configuration
            this.validateAgentConfig(config, factoryConfig);

            // Create agent instance based on type
            const agent = await this.instantiateAgent(config, factoryConfig);

            // Apply configuration
            await this.configureAgent(agent, config);

            // Initialize agent
            await agent.initialize();

            this.logger.info(`Agent '${config.name}' created successfully`);
            return agent;

        } catch (error) {
            this.logger.error(`Failed to create agent '${config.name}':`, error);
            throw error;
        }
    }

    /**
     * Create multiple agents from configurations
     */
    public async createAgentsBatch(configs: AgentConfig[]): Promise<AgentInterface[]> {
        this.logger.info(`Creating batch of ${configs.length} agents`);

        const creationPromises = configs.map(async (config) => {
            try {
                return await this.createAgent(config);
            } catch (error) {
                this.logger.error(`Failed to create agent ${config.name}:`, error);
                throw error;
            }
        });

        const results = await Promise.allSettled(creationPromises);
        
        const successfulAgents: AgentInterface[] = [];
        const failures: string[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successfulAgents.push(result.value);
            } else {
                failures.push(`${configs[index].name}: ${result.reason.message}`);
            }
        });

        if (failures.length > 0) {
            this.logger.warn(`Some agents failed to create: ${failures.join(', ')}`);
        }

        this.logger.info(`Created ${successfulAgents.length}/${configs.length} agents successfully`);
        return successfulAgents;
    }

    /**
     * Create agent with auto-scaling configuration
     */
    public async createScalableAgent(
        baseConfig: AgentConfig,
        minInstances: number = 1,
        maxInstances: number = 5
    ): Promise<AgentInterface[]> {
        
        const agents: AgentInterface[] = [];
        
        try {
            // Create minimum required instances
            for (let i = 0; i < minInstances; i++) {
                const config = {
                    ...baseConfig,
                    id: `${baseConfig.id}_${i}`,
                    name: `${baseConfig.name}_${i}`
                };
                
                const agent = await this.createAgent(config);
                agents.push(agent);
            }

            this.logger.info(`Created scalable agent group: ${minInstances} instances of ${baseConfig.type}`);
            return agents;

        } catch (error) {
            // Cleanup any created agents on failure
            await Promise.all(agents.map(agent => 
                agent.shutdown().catch(err => 
                    this.logger.error('Failed to cleanup agent during creation failure:', err)
                )
            ));
            
            throw error;
        }
    }

    /**
     * Get available agent types
     */
    public getAvailableAgentTypes(): string[] {
        return Array.from(this.agentTypes.keys());
    }

    /**
     * Get agent type configuration
     */
    public getAgentTypeConfig(agentType: string): AgentFactoryConfig | undefined {
        return this.agentTypes.get(agentType);
    }

    /**
     * Validate if an agent can be created with given resources
     */
    public validateResourceRequirements(
        configs: AgentConfig[],
        availableResources: {
            cpu: number;
            memory: number;
            gpu: boolean;
        }
    ): {
        canCreate: boolean;
        requiredResources: {
            cpu: number;
            memory: number;
            gpu: boolean;
        };
        issues: string[];
    } {
        
        let totalCpu = 0;
        let totalMemory = 0;
        let needsGpu = false;
        const issues: string[] = [];

        for (const config of configs) {
            const factoryConfig = this.agentTypes.get(config.type);
            
            if (!factoryConfig) {
                issues.push(`Unknown agent type: ${config.type}`);
                continue;
            }

            totalCpu += factoryConfig.resourceRequirements.cpu || 0.1;
            totalMemory += factoryConfig.resourceRequirements.memory || 128;
            
            if (factoryConfig.resourceRequirements.gpu) {
                needsGpu = true;
            }
        }

        // Check resource availability
        if (totalCpu > availableResources.cpu) {
            issues.push(`Insufficient CPU: need ${totalCpu}, have ${availableResources.cpu}`);
        }

        if (totalMemory > availableResources.memory) {
            issues.push(`Insufficient memory: need ${totalMemory}MB, have ${availableResources.memory}MB`);
        }

        if (needsGpu && !availableResources.gpu) {
            issues.push('GPU required but not available');
        }

        return {
            canCreate: issues.length === 0,
            requiredResources: {
                cpu: totalCpu,
                memory: totalMemory,
                gpu: needsGpu
            },
            issues
        };
    }

    // Private methods
    private registerBuiltInAgentTypes(): void {
        // Text Processing Agent
        this.agentTypes.set('text_processing', {
            type: 'text_processing',
            defaultCapabilities: [
                AgentCapability.TEXT_PROCESSING,
                AgentCapability.NATURAL_LANGUAGE,
                AgentCapability.SENTIMENT_ANALYSIS,
                AgentCapability.ENTITY_EXTRACTION,
                AgentCapability.CLASSIFICATION
            ],
            configurationSchema: {
                modelName: { type: 'string', default: 'gpt-4' },
                maxTokens: { type: 'number', default: 4000 },
                temperature: { type: 'number', default: 0.7 }
            },
            resourceRequirements: {
                cpu: 0.5,
                memory: 512,
                gpu: false
            },
            scalingLimits: {
                min: 1,
                max: 10
            }
        });

        // Vision Analyzer Agent
        this.agentTypes.set('vision_analyzer', {
            type: 'vision_analyzer',
            defaultCapabilities: [
                AgentCapability.VISION_ANALYSIS,
                AgentCapability.CLASSIFICATION,
                AgentCapability.MULTIMODAL_PROCESSING
            ],
            configurationSchema: {
                modelName: { type: 'string', default: 'clip' },
                inputResolution: { type: 'number', default: 224 },
                batchSize: { type: 'number', default: 32 }
            },
            resourceRequirements: {
                cpu: 1.0,
                memory: 1024,
                gpu: true
            },
            scalingLimits: {
                min: 1,
                max: 5
            }
        });

        // Speech Processing Agent
        this.agentTypes.set('speech_processing', {
            type: 'speech_processing',
            defaultCapabilities: [
                AgentCapability.SPEECH_PROCESSING,
                AgentCapability.NATURAL_LANGUAGE,
                AgentCapability.REAL_TIME_PROCESSING
            ],
            configurationSchema: {
                sampleRate: { type: 'number', default: 16000 },
                channels: { type: 'number', default: 1 },
                language: { type: 'string', default: 'en-US' }
            },
            resourceRequirements: {
                cpu: 0.8,
                memory: 768,
                gpu: false
            },
            scalingLimits: {
                min: 1,
                max: 8
            }
        });

        // Tutor Agent
        this.agentTypes.set('tutor', {
            type: 'tutor',
            defaultCapabilities: [
                AgentCapability.TUTORING,
                AgentCapability.NATURAL_LANGUAGE,
                AgentCapability.CONTENT_GENERATION,
                AgentCapability.DIALOGUE_MANAGEMENT
            ],
            configurationSchema: {
                subject: { type: 'string', default: 'general' },
                difficultyLevel: { type: 'string', default: 'intermediate' },
                personalityType: { type: 'string', default: 'encouraging' }
            },
            resourceRequirements: {
                cpu: 0.6,
                memory: 640,
                gpu: false
            },
            scalingLimits: {
                min: 1,
                max: 15
            }
        });

        // Assessment Agent
        this.agentTypes.set('assessment', {
            type: 'assessment',
            defaultCapabilities: [
                AgentCapability.ASSESSMENT,
                AgentCapability.NATURAL_LANGUAGE,
                AgentCapability.DATA_ANALYSIS,
                AgentCapability.CLASSIFICATION
            ],
            configurationSchema: {
                assessmentType: { type: 'string', default: 'formative' },
                gradingScale: { type: 'string', default: 'percentage' },
                feedbackDetail: { type: 'string', default: 'detailed' }
            },
            resourceRequirements: {
                cpu: 0.4,
                memory: 384,
                gpu: false
            },
            scalingLimits: {
                min: 1,
                max: 12
            }
        });
    }

    private async instantiateAgent(
        config: AgentConfig,
        factoryConfig: AgentFactoryConfig
    ): Promise<AgentInterface> {
        
        const dependencies = this.getDependenciesForAgent(config);

        switch (config.type) {
            case 'text_processing':
                return new TextProcessingAgent(
                    config.id,
                    config.name,
                    config.capabilities || factoryConfig.defaultCapabilities,
                    dependencies.logger
                );

            case 'vision_analyzer':
                return new VisionAnalyzerAgent(
                    config.id,
                    config.name,
                    config.capabilities || factoryConfig.defaultCapabilities,
                    dependencies.logger
                );

            case 'speech_processing':
                return new SpeechProcessingAgent(
                    config.id,
                    config.name,
                    config.capabilities || factoryConfig.defaultCapabilities,
                    dependencies.logger
                );

            case 'tutor':
                return new TutorAgent(
                    config.id,
                    config.name,
                    config.capabilities || factoryConfig.defaultCapabilities,
                    dependencies.logger
                );

            case 'assessment':
                return new AssessmentAgent(
                    config.id,
                    config.name,
                    config.capabilities || factoryConfig.defaultCapabilities,
                    dependencies.logger
                );

            default:
                throw new Error(`No implementation found for agent type: ${config.type}`);
        }
    }

    private async configureAgent(agent: AgentInterface, config: AgentConfig): Promise<void> {
        // Apply any additional configuration if the agent supports it
        if ('updateConfiguration' in agent && typeof agent.updateConfiguration === 'function') {
            const extendedAgent = agent as any;
            await extendedAgent.updateConfiguration(config);
        }
    }

    private validateAgentConfig(config: AgentConfig, factoryConfig: AgentFactoryConfig): void {
        // Validate required fields
        if (!config.id || !config.name || !config.type) {
            throw new Error('Agent config must include id, name, and type');
        }

        // Validate capabilities
        if (config.capabilities) {
            const invalidCaps = config.capabilities.filter(cap => 
                !Object.values(AgentCapability).includes(cap)
            );
            
            if (invalidCaps.length > 0) {
                throw new Error(`Invalid capabilities: ${invalidCaps.join(', ')}`);
            }
        }

        // Validate configuration against schema (simplified)
        if (factoryConfig.configurationSchema) {
            // In a full implementation, you'd use a proper schema validator
            this.logger.debug('Configuration schema validation passed');
        }
    }

    private getDependenciesForAgent(config: AgentConfig): Record<string, any> {
        const dependencies: Record<string, any> = {};
        
        // Inject logger
        dependencies.logger = new Logger(`Agent:${config.name}`);
        
        // Inject other registered dependencies
        for (const [name, instance] of this.dependencyRegistry) {
            dependencies[name] = instance;
        }
        
        return dependencies;
    }
}

export default AgentFactory;