import { BaseAgent } from '../core/BaseAgent';
import { SpecializedAgentInterface } from '../core/AgentInterface';
import { Logger } from '../../infrastructure/logging/logger';
import { TaskRequest, TaskResult, AgentCapability } from '../core/types';

/**
 * Specialized agent for text processing tasks
 * Handles natural language processing, analysis, and generation
 */
export class TextProcessingAgent extends BaseAgent implements SpecializedAgentInterface {
    private configuration: {
        modelName: string;
        maxTokens: number;
        temperature: number;
        supportedLanguages: string[];
        enabledFeatures: string[];
    };

    constructor(
        id: string,
        name: string,
        capabilities: AgentCapability[],
        logger?: Logger
    ) {
        super(id, name, capabilities, logger);
        
        this.configuration = {
            modelName: 'gpt-4',
            maxTokens: 4000,
            temperature: 0.7,
            supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
            enabledFeatures: [
                'sentiment_analysis',
                'entity_extraction',
                'text_classification',
                'summarization',
                'translation',
                'question_answering'
            ]
        };
    }

    // SpecializedAgentInterface implementation
    public getConfiguration(): Record<string, any> {
        return { ...this.configuration };
    }

    public async updateConfiguration(config: Record<string, any>): Promise<void> {
        try {
            if (config.modelName && typeof config.modelName === 'string') {
                this.configuration.modelName = config.modelName;
            }
            
            if (config.maxTokens && typeof config.maxTokens === 'number') {
                this.configuration.maxTokens = Math.min(Math.max(config.maxTokens, 100), 8000);
            }
            
            if (config.temperature && typeof config.temperature === 'number') {
                this.configuration.temperature = Math.min(Math.max(config.temperature, 0), 2);
            }

            if (config.supportedLanguages && Array.isArray(config.supportedLanguages)) {
                this.configuration.supportedLanguages = config.supportedLanguages;
            }

            if (config.enabledFeatures && Array.isArray(config.enabledFeatures)) {
                this.configuration.enabledFeatures = config.enabledFeatures;
            }

            this.logger.info(`Configuration updated for ${this.name}`);
            this.emit('configurationUpdated', this.configuration);

        } catch (error) {
            this.logger.error('Failed to update configuration:', error);
            throw error;
        }
    }

    public async getStatus(): Promise<Record<string, any>> {
        return {
            modelName: this.configuration.modelName,
            supportedLanguages: this.configuration.supportedLanguages,
            enabledFeatures: this.configuration.enabledFeatures,
            averageProcessingTime: this.getMetrics().averageProcessingTime,
            totalTasksProcessed: this.getMetrics().tasksCompleted
        };
    }

    public async validateTask(task: TaskRequest): Promise<boolean> {
        try {
            // Check if agent has required capabilities
            if (!this.canHandleTask(task)) {
                return false;
            }

            // Validate task data structure
            if (!task.data || typeof task.data !== 'object') {
                return false;
            }

            // Check for required fields based on task type
            switch (task.type) {
                case 'text_analysis':
                    return !!(task.data.text && typeof task.data.text === 'string');
                
                case 'sentiment_analysis':
                    return !!(task.data.text && typeof task.data.text === 'string');
                
                case 'entity_extraction':
                    return !!(task.data.text && typeof task.data.text === 'string');
                
                case 'text_classification':
                    return !!(task.data.text && typeof task.data.text === 'string');
                
                case 'summarization':
                    return !!(task.data.text && typeof task.data.text === 'string' && task.data.text.length > 100);
                
                case 'translation':
                    return !!(
                        task.data.text && 
                        task.data.sourceLanguage && 
                        task.data.targetLanguage &&
                        this.configuration.supportedLanguages.includes(task.data.sourceLanguage) &&
                        this.configuration.supportedLanguages.includes(task.data.targetLanguage)
                    );
                
                case 'question_answering':
                    return !!(
                        task.data.question && 
                        typeof task.data.question === 'string' &&
                        (task.data.context || task.data.knowledge_base)
                    );
                
                default:
                    return false;
            }

        } catch (error) {
            this.logger.error('Task validation failed:', error);
            return false;
        }
    }

    public async estimateProcessingTime(task: TaskRequest): Promise<number> {
        const baseTime = 1000; // 1 second base time
        const textLength = task.data?.text?.length || 0;
        
        switch (task.type) {
            case 'sentiment_analysis':
                return baseTime + (textLength * 0.1);
            
            case 'entity_extraction':
                return baseTime + (textLength * 0.2);
            
            case 'text_classification':
                return baseTime + (textLength * 0.15);
            
            case 'summarization':
                return baseTime + (textLength * 0.5);
            
            case 'translation':
                return baseTime + (textLength * 0.8);
            
            case 'question_answering':
                const contextLength = task.data?.context?.length || 0;
                return baseTime + (textLength * 0.3) + (contextLength * 0.1);
            
            default:
                return baseTime + (textLength * 0.2);
        }
    }

    // BaseAgent abstract methods implementation
    protected async onInitialize(): Promise<void> {
        this.logger.info(`Initializing Text Processing Agent with model: ${this.configuration.modelName}`);
        
        // Initialize NLP models and resources
        await this.loadModels();
        
        // Validate configuration
        await this.validateConfiguration();
        
        this.logger.info('Text Processing Agent initialized successfully');
    }

    protected async onShutdown(): Promise<void> {
        this.logger.info('Shutting down Text Processing Agent');
        
        // Clean up models and resources
        await this.unloadModels();
        
        this.logger.info('Text Processing Agent shut down successfully');
    }

    protected async executeTask(task: TaskRequest): Promise<TaskResult> {
        try {
            this.logger.info(`Executing ${task.type} task: ${task.id}`);

            let result: any;
            
            switch (task.type) {
                case 'text_analysis':
                    result = await this.analyzeText(task.data);
                    break;
                
                case 'sentiment_analysis':
                    result = await this.analyzeSentiment(task.data);
                    break;
                
                case 'entity_extraction':
                    result = await this.extractEntities(task.data);
                    break;
                
                case 'text_classification':
                    result = await this.classifyText(task.data);
                    break;
                
                case 'summarization':
                    result = await this.summarizeText(task.data);
                    break;
                
                case 'translation':
                    result = await this.translateText(task.data);
                    break;
                
                case 'question_answering':
                    result = await this.answerQuestion(task.data);
                    break;
                
                default:
                    throw new Error(`Unsupported task type: ${task.type}`);
            }

            return {
                taskId: task.id,
                success: true,
                data: result,
                processingTime: Date.now() - task.createdAt.getTime(),
                completedAt: new Date(),
                agentId: this.id
            };

        } catch (error) {
            this.logger.error(`Task execution failed for ${task.id}:`, error);
            
            return {
                taskId: task.id,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                processingTime: Date.now() - task.createdAt.getTime(),
                completedAt: new Date(),
                agentId: this.id
            };
        }
    }

    protected async performHealthCheck(): Promise<boolean> {
        try {
            // Check model availability
            const testInput = { text: 'Health check test' };
            await this.analyzeSentiment(testInput);
            
            return true;
        } catch (error) {
            this.logger.error('Health check failed:', error);
            return false;
        }
    }

    protected canHandleTask(task: TaskRequest): boolean {
        const textProcessingTasks = [
            'text_analysis',
            'sentiment_analysis', 
            'entity_extraction',
            'text_classification',
            'summarization',
            'translation',
            'question_answering'
        ];

        if (!textProcessingTasks.includes(task.type)) {
            return false;
        }

        // Check if required capabilities are available
        const requiredCapabilities = task.requiredCapabilities;
        return requiredCapabilities.every(cap => this.capabilities.has(cap));
    }

    // Private task execution methods
    private async loadModels(): Promise<void> {
        // Simulate model loading
        this.logger.debug('Loading NLP models...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.logger.debug('NLP models loaded successfully');
    }

    private async unloadModels(): Promise<void> {
        // Simulate model cleanup
        this.logger.debug('Unloading NLP models...');
        await new Promise(resolve => setTimeout(resolve, 500));
        this.logger.debug('NLP models unloaded');
    }

    private async validateConfiguration(): Promise<void> {
        const requiredFeatures = ['sentiment_analysis', 'entity_extraction'];
        const missingFeatures = requiredFeatures.filter(
            feature => !this.configuration.enabledFeatures.includes(feature)
        );

        if (missingFeatures.length > 0) {
            throw new Error(`Missing required features: ${missingFeatures.join(', ')}`);
        }
    }

    private async analyzeText(data: any): Promise<any> {
        const { text } = data;
        
        // Simulate comprehensive text analysis
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
            wordCount: text.split(' ').length,
            characterCount: text.length,
            sentences: text.split(/[.!?]+/).length - 1,
            language: await this.detectLanguage(text),
            readabilityScore: Math.random() * 100,
            keyPhrases: await this.extractKeyPhrases(text),
            sentiment: await this.analyzeSentiment({ text }),
            entities: await this.extractEntities({ text })
        };
    }

    private async analyzeSentiment(data: any): Promise<any> {
        const { text } = data;
        
        // Simulate sentiment analysis
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const sentimentScore = Math.random() * 2 - 1; // -1 to 1
        
        return {
            sentiment: sentimentScore > 0.1 ? 'positive' : sentimentScore < -0.1 ? 'negative' : 'neutral',
            score: sentimentScore,
            confidence: Math.random() * 0.3 + 0.7, // 0.7 to 1.0
            aspects: [
                { aspect: 'overall', sentiment: 'positive', score: sentimentScore }
            ]
        };
    }

    private async extractEntities(data: any): Promise<any> {
        const { text } = data;
        
        // Simulate entity extraction
        await new Promise(resolve => setTimeout(resolve, 80));
        
        // Simple pattern matching for demo
        const entities = [];
        
        // Find potential person names (capitalized words)
        const personMatches = text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) || [];
        personMatches.forEach(match => {
            entities.push({
                text: match,
                type: 'PERSON',
                start: text.indexOf(match),
                end: text.indexOf(match) + match.length,
                confidence: Math.random() * 0.3 + 0.7
            });
        });
        
        // Find dates
        const dateMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || [];
        dateMatches.forEach(match => {
            entities.push({
                text: match,
                type: 'DATE',
                start: text.indexOf(match),
                end: text.indexOf(match) + match.length,
                confidence: 0.9
            });
        });

        return { entities };
    }

    private async classifyText(data: any): Promise<any> {
        const { text, categories } = data;
        
        // Simulate text classification
        await new Promise(resolve => setTimeout(resolve, 60));
        
        const availableCategories = categories || [
            'business', 'technology', 'entertainment', 'sports', 'politics'
        ];
        
        const scores = availableCategories.map(category => ({
            category,
            score: Math.random(),
            confidence: Math.random() * 0.3 + 0.7
        }));
        
        scores.sort((a, b) => b.score - a.score);
        
        return {
            predictedCategory: scores[0].category,
            confidence: scores[0].confidence,
            allScores: scores
        };
    }

    private async summarizeText(data: any): Promise<any> {
        const { text, maxLength } = data;
        const targetLength = maxLength || Math.floor(text.length * 0.3);
        
        // Simulate text summarization
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Simple extractive summarization (first sentences)
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        let summary = '';
        let currentLength = 0;
        
        for (const sentence of sentences) {
            if (currentLength + sentence.length <= targetLength) {
                summary += sentence.trim() + '. ';
                currentLength += sentence.length;
            } else {
                break;
            }
        }
        
        return {
            summary: summary.trim(),
            originalLength: text.length,
            summaryLength: summary.length,
            compressionRatio: summary.length / text.length,
            extractedSentences: Math.ceil(summary.split('.').length)
        };
    }

    private async translateText(data: any): Promise<any> {
        const { text, sourceLanguage, targetLanguage } = data;
        
        // Simulate translation
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Mock translation (in reality, would use translation API)
        const translatedText = `[Translated from ${sourceLanguage} to ${targetLanguage}] ${text}`;
        
        return {
            translatedText,
            sourceLanguage,
            targetLanguage,
            confidence: Math.random() * 0.2 + 0.8,
            detectedSourceLanguage: sourceLanguage
        };
    }

    private async answerQuestion(data: any): Promise<any> {
        const { question, context, knowledge_base } = data;
        
        // Simulate question answering
        await new Promise(resolve => setTimeout(resolve, 120));
        
        return {
            answer: `Based on the provided context, here is the answer to: "${question}"`,
            confidence: Math.random() * 0.3 + 0.7,
            sources: context ? ['provided_context'] : ['knowledge_base'],
            answerType: 'extractive'
        };
    }

    private async detectLanguage(text: string): Promise<string> {
        // Simple language detection simulation
        const commonWords = {
            'en': ['the', 'and', 'is', 'in', 'to', 'of', 'a'],
            'es': ['el', 'la', 'de', 'que', 'y', 'en', 'un'],
            'fr': ['le', 'de', 'et', 'à', 'un', 'il', 'être']
        };
        
        const words = text.toLowerCase().split(/\s+/);
        let maxMatches = 0;
        let detectedLang = 'en';
        
        for (const [lang, langWords] of Object.entries(commonWords)) {
            const matches = words.filter(word => langWords.includes(word)).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                detectedLang = lang;
            }
        }
        
        return detectedLang;
    }

    private async extractKeyPhrases(text: string): Promise<string[]> {
        // Simple key phrase extraction
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        const wordFreq = words.reduce((freq, word) => {
            freq[word] = (freq[word] || 0) + 1;
            return freq;
        }, {} as Record<string, number>);
        
        return Object.entries(wordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([word]) => word);
    }
}

export default TextProcessingAgent;