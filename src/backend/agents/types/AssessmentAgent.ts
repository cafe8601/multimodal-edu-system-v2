import { BaseAgent } from '../core/BaseAgent';
import { SpecializedAgentInterface, BatchProcessingAgentInterface } from '../core/AgentInterface';
import { Logger } from '../../infrastructure/logging/logger';
import { TaskRequest, TaskResult, AgentCapability } from '../core/types';

/**
 * Specialized agent for educational assessment and evaluation
 */
export class AssessmentAgent extends BaseAgent implements SpecializedAgentInterface, BatchProcessingAgentInterface {
    private configuration: {
        assessmentType: string;
        gradingScale: string;
        feedbackDetail: string;
        rubricBased: boolean;
        autoGrading: boolean;
    };

    private rubrics: Map<string, any> = new Map();
    private gradingHistory: Map<string, any[]> = new Map();

    constructor(
        id: string,
        name: string,
        capabilities: AgentCapability[],
        logger?: Logger
    ) {
        super(id, name, capabilities, logger);
        
        this.configuration = {
            assessmentType: 'formative',
            gradingScale: 'percentage',
            feedbackDetail: 'detailed',
            rubricBased: true,
            autoGrading: true
        };
    }

    // BatchProcessingAgentInterface implementation
    public async processBatch(tasks: TaskRequest[]): Promise<TaskResult[]> {
        const batchSize = this.getOptimalBatchSize();
        const results: TaskResult[] = [];

        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(task => this.executeTask(task))
            );
            results.push(...batchResults);
        }

        return results;
    }

    public getOptimalBatchSize(): number {
        return 10; // Process 10 assessments at once
    }

    public canProcessBatch(): boolean {
        return this.getState() === 'idle' || this.getState() === 'busy';
    }

    // SpecializedAgentInterface implementation
    public getConfiguration(): Record<string, any> {
        return { ...this.configuration };
    }

    public async updateConfiguration(config: Record<string, any>): Promise<void> {
        if (config.assessmentType) this.configuration.assessmentType = config.assessmentType;
        if (config.gradingScale) this.configuration.gradingScale = config.gradingScale;
        if (config.feedbackDetail) this.configuration.feedbackDetail = config.feedbackDetail;
        this.emit('configurationUpdated', this.configuration);
    }

    public async getStatus(): Promise<Record<string, any>> {
        return {
            assessmentType: this.configuration.assessmentType,
            totalAssessments: this.getMetrics().tasksCompleted,
            rubricCount: this.rubrics.size,
            averageGradingTime: this.getMetrics().averageProcessingTime,
            autoGradingEnabled: this.configuration.autoGrading
        };
    }

    public async validateTask(task: TaskRequest): Promise<boolean> {
        return !!(task.data?.submission || task.data?.answers);
    }

    public async estimateProcessingTime(task: TaskRequest): Promise<number> {
        const baseTime = 1500;
        const complexity = task.data?.complexity || 'medium';
        const hasRubric = task.data?.rubricId && this.rubrics.has(task.data.rubricId);
        
        let multiplier = 1;
        if (complexity === 'high') multiplier = 1.5;
        if (complexity === 'low') multiplier = 0.7;
        if (!hasRubric) multiplier *= 1.2; // More time without predefined rubric
        
        return baseTime * multiplier;
    }

    // BaseAgent implementation
    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Assessment Agent');
        await this.loadGradingRubrics();
        await this.initializeGradingModels();
    }

    protected async onShutdown(): Promise<void> {
        this.logger.info('Shutting down Assessment Agent');
        this.rubrics.clear();
        this.gradingHistory.clear();
    }

    protected async executeTask(task: TaskRequest): Promise<TaskResult> {
        try {
            let result: any;

            switch (task.type) {
                case 'grade_submission':
                    result = await this.gradeSubmission(task.data);
                    break;
                case 'evaluate_quiz':
                    result = await this.evaluateQuiz(task.data);
                    break;
                case 'assess_learning':
                    result = await this.assessLearning(task.data);
                    break;
                case 'generate_feedback':
                    result = await this.generateFeedback(task.data);
                    break;
                case 'create_rubric':
                    result = await this.createRubric(task.data);
                    break;
                default:
                    throw new Error(`Unsupported task type: ${task.type}`);
            }

            // Store in grading history
            this.storeGradingHistory(task.data?.studentId, result);

            return {
                taskId: task.id,
                success: true,
                data: result,
                processingTime: Date.now() - task.createdAt.getTime(),
                completedAt: new Date(),
                agentId: this.id
            };

        } catch (error) {
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
            await this.gradeSubmission({ 
                submission: 'Test submission',
                subject: 'math'
            });
            return true;
        } catch {
            return false;
        }
    }

    protected canHandleTask(task: TaskRequest): boolean {
        const assessmentTasks = [
            'grade_submission', 
            'evaluate_quiz', 
            'assess_learning', 
            'generate_feedback', 
            'create_rubric'
        ];
        return assessmentTasks.includes(task.type);
    }

    // Private methods
    private async loadGradingRubrics(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Load default rubrics
        this.rubrics.set('math_basic', {
            criteria: [
                { name: 'Accuracy', weight: 0.6, maxPoints: 10 },
                { name: 'Method', weight: 0.3, maxPoints: 10 },
                { name: 'Presentation', weight: 0.1, maxPoints: 10 }
            ]
        });
        
        this.rubrics.set('essay_writing', {
            criteria: [
                { name: 'Content', weight: 0.4, maxPoints: 25 },
                { name: 'Organization', weight: 0.3, maxPoints: 25 },
                { name: 'Language', weight: 0.2, maxPoints: 25 },
                { name: 'Mechanics', weight: 0.1, maxPoints: 25 }
            ]
        });
        
        this.logger.debug('Grading rubrics loaded');
    }

    private async initializeGradingModels(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 500));
        this.logger.debug('Grading models initialized');
    }

    private async gradeSubmission(data: any): Promise<any> {
        const { submission, subject, rubricId } = data;
        await new Promise(resolve => setTimeout(resolve, 200));

        const rubric = rubricId ? this.rubrics.get(rubricId) : null;
        
        // Simulate grading logic
        let totalScore = 0;
        let maxScore = 100;
        const criteriaScores: any[] = [];

        if (rubric) {
            maxScore = 0;
            for (const criterion of rubric.criteria) {
                const score = Math.random() * criterion.maxPoints;
                criteriaScores.push({
                    name: criterion.name,
                    score: Math.round(score * 100) / 100,
                    maxScore: criterion.maxPoints,
                    feedback: `Good work on ${criterion.name.toLowerCase()}`
                });
                totalScore += score * criterion.weight;
                maxScore += criterion.maxPoints * criterion.weight;
            }
        } else {
            totalScore = Math.random() * 85 + 15; // 15-100
        }

        const percentage = (totalScore / maxScore) * 100;
        const letterGrade = this.calculateLetterGrade(percentage);

        return {
            totalScore: Math.round(totalScore * 100) / 100,
            maxScore,
            percentage: Math.round(percentage * 100) / 100,
            letterGrade,
            criteriaScores,
            feedback: this.generateDetailedFeedback(percentage, criteriaScores),
            gradedAt: new Date(),
            gradedBy: this.id
        };
    }

    private async evaluateQuiz(data: any): Promise<any> {
        const { answers, correctAnswers } = data;
        await new Promise(resolve => setTimeout(resolve, 100));

        let correct = 0;
        const questionResults = answers.map((answer: any, index: number) => {
            const isCorrect = answer === correctAnswers[index];
            if (isCorrect) correct++;
            
            return {
                questionIndex: index,
                userAnswer: answer,
                correctAnswer: correctAnswers[index],
                isCorrect,
                points: isCorrect ? 1 : 0
            };
        });

        const percentage = (correct / answers.length) * 100;

        return {
            totalQuestions: answers.length,
            correctAnswers: correct,
            incorrectAnswers: answers.length - correct,
            percentage: Math.round(percentage * 100) / 100,
            letterGrade: this.calculateLetterGrade(percentage),
            questionResults,
            recommendations: this.generateQuizRecommendations(questionResults)
        };
    }

    private async assessLearning(data: any): Promise<any> {
        const { studentId, timeframe } = data;
        await new Promise(resolve => setTimeout(resolve, 150));

        const history = this.gradingHistory.get(studentId) || [];
        
        return {
            overallProgress: Math.random() * 30 + 70, // 70-100%
            recentPerformance: Math.random() * 40 + 60, // 60-100%
            improvementTrend: Math.random() > 0.6 ? 'improving' : 'stable',
            strengths: ['Problem solving', 'Critical thinking'],
            weaknesses: ['Time management', 'Attention to detail'],
            recommendations: [
                'Focus on practice problems',
                'Review feedback from previous assessments'
            ],
            masteredConcepts: ['Basic algebra', 'Fractions'],
            strugglingConcepts: ['Word problems', 'Geometry'],
            assessmentCount: history.length
        };
    }

    private async generateFeedback(data: any): Promise<any> {
        const { score, subject, criteriaScores } = data;
        await new Promise(resolve => setTimeout(resolve, 80));

        return {
            overallFeedback: this.generateDetailedFeedback(score, criteriaScores),
            suggestions: [
                'Review the concepts that were challenging',
                'Practice similar problems',
                'Seek help if needed'
            ],
            encouragement: score >= 80 ? 
                'Excellent work! Keep up the great effort.' :
                score >= 60 ?
                'Good progress! With more practice, you can improve further.' :
                'Don\'t be discouraged. Learning takes time and practice.',
            nextSteps: [
                'Review feedback carefully',
                'Identify areas for improvement',
                'Practice additional exercises'
            ]
        };
    }

    private async createRubric(data: any): Promise<any> {
        const { rubricName, criteria } = data;
        await new Promise(resolve => setTimeout(resolve, 100));

        const rubric = {
            name: rubricName,
            criteria: criteria.map((c: any) => ({
                name: c.name,
                weight: c.weight || 1 / criteria.length,
                maxPoints: c.maxPoints || 10,
                description: c.description || `Assessment criteria for ${c.name}`
            })),
            createdAt: new Date(),
            createdBy: this.id
        };

        this.rubrics.set(rubricName, rubric);

        return {
            rubricId: rubricName,
            rubric,
            success: true
        };
    }

    // Helper methods
    private calculateLetterGrade(percentage: number): string {
        if (percentage >= 97) return 'A+';
        if (percentage >= 93) return 'A';
        if (percentage >= 90) return 'A-';
        if (percentage >= 87) return 'B+';
        if (percentage >= 83) return 'B';
        if (percentage >= 80) return 'B-';
        if (percentage >= 77) return 'C+';
        if (percentage >= 73) return 'C';
        if (percentage >= 70) return 'C-';
        if (percentage >= 67) return 'D+';
        if (percentage >= 60) return 'D';
        return 'F';
    }

    private generateDetailedFeedback(percentage: number, criteriaScores: any[]): string {
        let feedback = '';
        
        if (percentage >= 90) {
            feedback = 'Excellent work! You demonstrate mastery of the subject matter.';
        } else if (percentage >= 80) {
            feedback = 'Good job! You show solid understanding with room for minor improvements.';
        } else if (percentage >= 70) {
            feedback = 'Fair work. You understand the basics but need to strengthen key areas.';
        } else {
            feedback = 'Needs improvement. Please review the material and seek additional help.';
        }

        if (criteriaScores && criteriaScores.length > 0) {
            const strongAreas = criteriaScores.filter(c => c.score / c.maxScore >= 0.8);
            const weakAreas = criteriaScores.filter(c => c.score / c.maxScore < 0.6);

            if (strongAreas.length > 0) {
                feedback += ` Strong areas: ${strongAreas.map(a => a.name).join(', ')}.`;
            }
            
            if (weakAreas.length > 0) {
                feedback += ` Areas needing attention: ${weakAreas.map(a => a.name).join(', ')}.`;
            }
        }

        return feedback;
    }

    private generateQuizRecommendations(questionResults: any[]): string[] {
        const incorrectQuestions = questionResults.filter(q => !q.isCorrect);
        const recommendations = [];

        if (incorrectQuestions.length === 0) {
            recommendations.push('Excellent work! All answers correct.');
        } else if (incorrectQuestions.length <= 2) {
            recommendations.push('Very good performance with minor areas to review.');
        } else {
            recommendations.push('Review the concepts for missed questions.');
            recommendations.push('Practice similar problems for better understanding.');
        }

        return recommendations;
    }

    private storeGradingHistory(studentId: string, result: any): void {
        if (!studentId) return;
        
        if (!this.gradingHistory.has(studentId)) {
            this.gradingHistory.set(studentId, []);
        }
        
        this.gradingHistory.get(studentId)!.push({
            ...result,
            timestamp: new Date()
        });
        
        // Keep only last 50 records per student
        const history = this.gradingHistory.get(studentId)!;
        if (history.length > 50) {
            this.gradingHistory.set(studentId, history.slice(-50));
        }
    }
}

export default AssessmentAgent;