import { InteractionTracker } from './InteractionTracker';
import { PatternAnalyzer } from './PatternAnalyzer';
import { PerformanceMetrics } from './PerformanceMetrics';
import { UserInteraction } from '../../models/analytics/UserInteraction';
import { LearningPattern } from '../../models/analytics/LearningPattern';

export class LearningAnalyticsEngine {
  private interactionTracker: InteractionTracker;
  private patternAnalyzer: PatternAnalyzer;
  private performanceMetrics: PerformanceMetrics;

  constructor() {
    this.interactionTracker = new InteractionTracker();
    this.patternAnalyzer = new PatternAnalyzer();
    this.performanceMetrics = new PerformanceMetrics();
  }

  async trackInteraction(interaction: UserInteraction): Promise<void> {
    await this.interactionTracker.track(interaction);
    await this.analyzePatterns(interaction.userId);
  }

  async analyzePatterns(userId: string): Promise<LearningPattern[]> {
    const interactions = await this.interactionTracker.getInteractions(userId);
    return this.patternAnalyzer.analyze(interactions);
  }

  async calculateMetrics(userId: string): Promise<any> {
    const interactions = await this.interactionTracker.getInteractions(userId);
    const patterns = await this.analyzePatterns(userId);
    return this.performanceMetrics.calculate(interactions, patterns);
  }
}
