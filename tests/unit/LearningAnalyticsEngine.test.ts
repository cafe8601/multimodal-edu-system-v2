import { LearningAnalyticsEngine } from '@/services/analytics/LearningAnalyticsEngine';
import { UserInteraction } from '@/models/analytics/UserInteraction';

describe('LearningAnalyticsEngine', () => {
  let engine: LearningAnalyticsEngine;

  beforeEach(() => {
    engine = new LearningAnalyticsEngine();
  });

  describe('trackInteraction', () => {
    it('should track user interaction successfully', async () => {
      const interaction: UserInteraction = {
        id: 'test-123',
        userId: 'user-456',
        sessionId: 'session-789',
        agentId: 'agent-001',
        type: 'question',
        content: 'What is machine learning?',
        timestamp: new Date(),
        metadata: {
          responseTime: 1500,
          confidence: 0.95,
        },
      };

      await expect(engine.trackInteraction(interaction)).resolves.not.toThrow();
    });

    it('should handle invalid interaction data', async () => {
      const invalidInteraction = {} as UserInteraction;
      
      await expect(engine.trackInteraction(invalidInteraction))
        .rejects.toThrow('Invalid interaction data');
    });
  });

  describe('analyzePatterns', () => {
    it('should identify learning patterns for a user', async () => {
      const userId = 'user-456';
      const patterns = await engine.analyzePatterns(userId);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate performance metrics', async () => {
      const userId = 'user-456';
      const metrics = await engine.calculateMetrics(userId);

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('engagementScore');
    });
  });
});
