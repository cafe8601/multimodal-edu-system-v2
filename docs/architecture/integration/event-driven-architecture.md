# Event-Driven Architecture Implementation

## Overview

This document details the implementation of event-driven architecture (EDA) in the multimodal education system, focusing on event sourcing, CQRS patterns, and asynchronous communication strategies.

## Event-Driven Architecture Principles

### Core Concepts

1. **Events as First-Class Citizens**: All significant state changes are modeled as events
2. **Loose Coupling**: Services communicate through events, not direct calls
3. **Eventual Consistency**: System reaches consistency over time through event propagation
4. **Event Sourcing**: System state is derived from a sequence of events
5. **Scalability**: Events enable horizontal scaling and load distribution

### Event Types

#### Domain Events
Events that represent business-significant occurrences:
```typescript
interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: Date;
  data: any;
  metadata: EventMetadata;
}

interface EventMetadata {
  causationId: string;    // Event that caused this event
  correlationId: string;  // Request/session that triggered this
  userId?: string;        // User who triggered the event
  tenantId?: string;      // Multi-tenancy support
  source: string;         // Service that generated the event
}
```

#### Integration Events
Events for inter-service communication:
```typescript
interface IntegrationEvent {
  eventId: string;
  eventType: string;
  version: string;
  timestamp: Date;
  source: string;
  data: any;
  schema: string;
}
```

## Event Categories and Schemas

### 1. User Management Events

#### User Registered Event
```json
{
  "eventType": "UserRegistered",
  "version": "1.0.0",
  "schema": {
    "userId": "string",
    "email": "string", 
    "username": "string",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "preferences": "object"
    },
    "registrationSource": "string",
    "timestamp": "ISO8601"
  },
  "example": {
    "userId": "user_12345",
    "email": "john.doe@example.com",
    "username": "johndoe",
    "profile": {
      "firstName": "John",
      "lastName": "Doe",
      "preferences": {
        "language": "en",
        "timezone": "UTC"
      }
    },
    "registrationSource": "web_app",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### User Profile Updated Event
```json
{
  "eventType": "UserProfileUpdated",
  "version": "1.0.0",
  "schema": {
    "userId": "string",
    "changedFields": "array",
    "previousValues": "object",
    "newValues": "object",
    "timestamp": "ISO8601"
  }
}
```

### 2. Content Processing Events

#### Content Uploaded Event
```json
{
  "eventType": "ContentUploaded",
  "version": "1.2.0",
  "schema": {
    "contentId": "string",
    "userId": "string",
    "contentType": "enum[text,image,audio,document,video]",
    "fileName": "string",
    "fileSize": "number",
    "mimeType": "string",
    "fileUrl": "string",
    "metadata": {
      "title": "string",
      "description": "string",
      "tags": "array"
    },
    "processingOptions": {
      "extractText": "boolean",
      "analyzeSentiment": "boolean",
      "extractEntities": "boolean",
      "generateSummary": "boolean"
    },
    "timestamp": "ISO8601"
  }
}
```

#### Content Processing Completed Event
```json
{
  "eventType": "ContentProcessingCompleted",
  "version": "2.0.0",
  "schema": {
    "contentId": "string",
    "userId": "string",
    "processingType": "string",
    "status": "enum[success,partial,failed]",
    "results": {
      "extractedText": "string",
      "language": "string",
      "sentiment": {
        "score": "number",
        "label": "string"
      },
      "entities": "array",
      "topics": "array",
      "summary": "string",
      "keywords": "array",
      "confidence": "number"
    },
    "processingDuration": "number",
    "timestamp": "ISO8601"
  }
}
```

### 3. Learning Management Events

#### Learning Session Started Event
```json
{
  "eventType": "LearningSessionStarted",
  "version": "1.0.0",
  "schema": {
    "sessionId": "string",
    "userId": "string",
    "learningPathId": "string",
    "moduleId": "string",
    "deviceInfo": {
      "type": "string",
      "os": "string",
      "browser": "string"
    },
    "timestamp": "ISO8601"
  }
}
```

#### Assessment Completed Event
```json
{
  "eventType": "AssessmentCompleted",
  "version": "1.1.0",
  "schema": {
    "assessmentId": "string",
    "userId": "string",
    "sessionId": "string",
    "score": "number",
    "maxScore": "number",
    "passed": "boolean",
    "timeSpent": "number",
    "answers": "array",
    "analytics": {
      "correctAnswers": "number",
      "incorrectAnswers": "number",
      "skippedAnswers": "number",
      "averageTimePerQuestion": "number"
    },
    "timestamp": "ISO8601"
  }
}
```

### 4. Agent Orchestration Events

#### Task Assigned Event
```json
{
  "eventType": "TaskAssigned",
  "version": "1.0.0",
  "schema": {
    "taskId": "string",
    "agentId": "string",
    "agentType": "enum[researcher,analyzer,creator,reviewer,coordinator]",
    "taskType": "string",
    "priority": "enum[low,normal,high,critical]",
    "payload": "object",
    "expectedDuration": "number",
    "deadline": "ISO8601",
    "timestamp": "ISO8601"
  }
}
```

#### Task Completed Event
```json
{
  "eventType": "TaskCompleted",
  "version": "1.1.0",
  "schema": {
    "taskId": "string",
    "agentId": "string",
    "status": "enum[completed,failed,cancelled]",
    "result": "object",
    "executionTime": "number",
    "resourceUsage": {
      "cpuTime": "number",
      "memoryUsage": "number",
      "apiCalls": "number"
    },
    "qualityMetrics": {
      "accuracy": "number",
      "completeness": "number",
      "relevance": "number"
    },
    "timestamp": "ISO8601"
  }
}
```

## Event Store Implementation

### Event Store Interface
```typescript
interface EventStore {
  appendEvents(streamId: string, expectedVersion: number, events: DomainEvent[]): Promise<number>;
  getEvents(streamId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getAllEvents(fromPosition?: number): Promise<DomainEvent[]>;
  getEventsByType(eventType: string, fromPosition?: number): Promise<DomainEvent[]>;
  createSnapshot(streamId: string, version: number, data: any): Promise<void>;
  getSnapshot(streamId: string): Promise<Snapshot | null>;
}
```

### PostgreSQL Event Store Implementation
```sql
-- Event Store Schema
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  stream_id VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  metadata JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(stream_id, version)
);

CREATE INDEX idx_events_stream_id ON events(stream_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp);

-- Snapshots Table
CREATE TABLE snapshots (
  stream_id VARCHAR(255) PRIMARY KEY,
  version INTEGER NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```typescript
class PostgreSQLEventStore implements EventStore {
  constructor(private pool: Pool) {}

  async appendEvents(
    streamId: string, 
    expectedVersion: number, 
    events: DomainEvent[]
  ): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check current version
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) as current_version FROM events WHERE stream_id = $1',
        [streamId]
      );
      
      const currentVersion = versionResult.rows[0].current_version;
      
      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyError(`Expected version ${expectedVersion}, but was ${currentVersion}`);
      }
      
      // Append events
      let newVersion = currentVersion;
      for (const event of events) {
        newVersion++;
        await client.query(`
          INSERT INTO events (stream_id, version, event_type, event_data, metadata, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          streamId,
          newVersion,
          event.type,
          JSON.stringify(event.data),
          JSON.stringify(event.metadata),
          event.timestamp
        ]);
      }
      
      await client.query('COMMIT');
      
      // Publish to event bus
      await this.publishEvents(events);
      
      return newVersion;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getEvents(streamId: string, fromVersion: number = 0): Promise<DomainEvent[]> {
    const result = await this.pool.query(`
      SELECT version, event_type, event_data, metadata, timestamp
      FROM events
      WHERE stream_id = $1 AND version > $2
      ORDER BY version ASC
    `, [streamId, fromVersion]);
    
    return result.rows.map(this.mapRowToEvent);
  }

  private mapRowToEvent(row: any): DomainEvent {
    return {
      id: `${row.stream_id}_${row.version}`,
      type: row.event_type,
      aggregateId: row.stream_id,
      aggregateType: row.metadata.aggregateType,
      version: row.version,
      timestamp: row.timestamp,
      data: row.event_data,
      metadata: row.metadata
    };
  }
}
```

## Event Bus Implementation

### Apache Kafka Configuration
```yaml
kafka_cluster:
  brokers: 3
  replication_factor: 3
  min_insync_replicas: 2
  
topics:
  user_events:
    partitions: 12
    replication_factor: 3
    retention_ms: 604800000  # 7 days
    cleanup_policy: delete
    
  content_events:
    partitions: 24
    replication_factor: 3
    retention_ms: 2592000000  # 30 days
    cleanup_policy: delete
    
  learning_events:
    partitions: 12
    replication_factor: 3
    retention_ms: 5184000000  # 60 days
    cleanup_policy: delete
    
  agent_events:
    partitions: 6
    replication_factor: 3
    retention_ms: 1209600000  # 14 days
    cleanup_policy: delete

producer_config:
  acks: all
  retries: 2147483647
  max_in_flight_requests_per_connection: 1
  enable_idempotence: true
  compression_type: snappy
  batch_size: 16384
  linger_ms: 5
  buffer_memory: 33554432

consumer_config:
  auto_offset_reset: earliest
  enable_auto_commit: false
  session_timeout_ms: 30000
  heartbeat_interval_ms: 3000
  max_poll_records: 500
  max_poll_interval_ms: 300000
```

### Event Publisher Implementation
```typescript
class KafkaEventPublisher {
  private producer: kafka.Producer;

  constructor(private kafka: kafka.Kafka) {
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      transactionTimeout: 30000
    });
  }

  async publish(events: IntegrationEvent[]): Promise<void> {
    const messages = events.map(event => ({
      topic: this.getTopicForEvent(event.eventType),
      key: event.data.aggregateId || event.eventId,
      value: JSON.stringify(event),
      headers: {
        eventType: event.eventType,
        version: event.version,
        source: event.source,
        correlationId: event.data.metadata?.correlationId || '',
        timestamp: event.timestamp.toISOString()
      }
    }));

    await this.producer.sendBatch({
      topicMessages: this.groupMessagesByTopic(messages)
    });
  }

  private getTopicForEvent(eventType: string): string {
    if (eventType.startsWith('User')) return 'user_events';
    if (eventType.startsWith('Content')) return 'content_events';
    if (eventType.startsWith('Learning') || eventType.startsWith('Assessment')) return 'learning_events';
    if (eventType.startsWith('Task') || eventType.startsWith('Agent')) return 'agent_events';
    return 'general_events';
  }

  private groupMessagesByTopic(messages: any[]): any[] {
    const grouped = new Map();
    
    messages.forEach(message => {
      if (!grouped.has(message.topic)) {
        grouped.set(message.topic, []);
      }
      grouped.get(message.topic).push({
        key: message.key,
        value: message.value,
        headers: message.headers
      });
    });
    
    return Array.from(grouped.entries()).map(([topic, messages]) => ({
      topic,
      messages
    }));
  }
}
```

### Event Consumer Implementation
```typescript
class EventConsumer {
  private consumer: kafka.Consumer;
  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(
    private kafka: kafka.Kafka,
    private groupId: string
  ) {
    this.consumer = this.kafka.consumer({ groupId });
  }

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    
    // Subscribe to all relevant topics
    const topics = ['user_events', 'content_events', 'learning_events', 'agent_events'];
    await this.consumer.subscribe({ topics });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value!.toString());
          const eventType = message.headers?.eventType?.toString();
          
          if (eventType && this.handlers.has(eventType)) {
            const handlers = this.handlers.get(eventType)!;
            
            // Process handlers in parallel
            await Promise.all(
              handlers.map(handler => 
                this.processWithRetry(handler, event, message)
              )
            );
          }
          
          // Manual commit after successful processing
          await this.consumer.commitOffsets([{
            topic,
            partition,
            offset: (parseInt(message.offset) + 1).toString()
          }]);
          
        } catch (error) {
          console.error('Error processing message:', error);
          // Send to dead letter queue
          await this.sendToDeadLetterQueue(message, error);
        }
      }
    });
  }

  private async processWithRetry(
    handler: EventHandler, 
    event: any, 
    message: kafka.KafkaMessage
  ): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        await handler.handle(event);
        return; // Success
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
```

## Event Handlers and Projections

### Read Model Projections
```typescript
// User Read Model Projection
class UserProjectionHandler implements EventHandler {
  constructor(private readDb: Database) {}

  async handle(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case 'UserRegistered':
        await this.handleUserRegistered(event);
        break;
      case 'UserProfileUpdated':
        await this.handleUserProfileUpdated(event);
        break;
      case 'UserDeactivated':
        await this.handleUserDeactivated(event);
        break;
    }
  }

  private async handleUserRegistered(event: DomainEvent): Promise<void> {
    const { userId, email, username, profile } = event.data;
    
    await this.readDb.query(`
      INSERT INTO user_read_model (
        id, email, username, first_name, last_name, 
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      email,
      username,
      profile.firstName,
      profile.lastName,
      'active',
      event.timestamp,
      event.timestamp
    ]);
  }

  private async handleUserProfileUpdated(event: DomainEvent): Promise<void> {
    const { userId, newValues } = event.data;
    
    const updates = [];
    const values = [userId];
    let paramIndex = 2;

    Object.keys(newValues).forEach(field => {
      updates.push(`${field} = $${paramIndex}`);
      values.push(newValues[field]);
      paramIndex++;
    });

    updates.push(`updated_at = $${paramIndex}`);
    values.push(event.timestamp);

    await this.readDb.query(`
      UPDATE user_read_model 
      SET ${updates.join(', ')}
      WHERE id = $1
    `, values);
  }
}
```

### Analytics Event Handler
```typescript
class AnalyticsEventHandler implements EventHandler {
  constructor(
    private analyticsDb: Database,
    private metricsService: MetricsService
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    // Store raw event for analytics
    await this.storeAnalyticsEvent(event);
    
    // Update real-time metrics
    await this.updateMetrics(event);
    
    // Trigger specific analytics workflows
    await this.triggerAnalyticsWorkflows(event);
  }

  private async storeAnalyticsEvent(event: DomainEvent): Promise<void> {
    await this.analyticsDb.query(`
      INSERT INTO analytics_events (
        event_id, event_type, aggregate_id, aggregate_type,
        user_id, tenant_id, timestamp, data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      event.id,
      event.type,
      event.aggregateId,
      event.aggregateType,
      event.metadata.userId,
      event.metadata.tenantId,
      event.timestamp,
      JSON.stringify(event.data)
    ]);
  }

  private async updateMetrics(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case 'UserRegistered':
        this.metricsService.increment('users.registered');
        break;
      case 'ContentUploaded':
        this.metricsService.increment('content.uploads');
        this.metricsService.increment(`content.uploads.${event.data.contentType}`);
        break;
      case 'LearningSessionStarted':
        this.metricsService.increment('learning.sessions_started');
        break;
      case 'TaskCompleted':
        this.metricsService.increment('tasks.completed');
        this.metricsService.histogram('tasks.execution_time', event.data.executionTime);
        break;
    }
  }
}
```

## Event Sourcing Patterns

### Aggregate Implementation
```typescript
abstract class AggregateRoot {
  private uncommittedEvents: DomainEvent[] = [];
  protected version: number = 0;
  
  protected addEvent(event: DomainEvent): void {
    event.version = this.version + 1;
    this.uncommittedEvents.push(event);
    this.apply(event);
  }
  
  abstract apply(event: DomainEvent): void;
  
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }
  
  clearUncommittedEvents(): void {
    this.uncommittedEvents = [];
    this.version = this.uncommittedEvents.length > 0 
      ? this.uncommittedEvents[this.uncommittedEvents.length - 1].version 
      : this.version;
  }
  
  loadFromHistory(events: DomainEvent[]): void {
    events.forEach(event => {
      this.apply(event);
      this.version = event.version;
    });
  }
}

class ContentAggregate extends AggregateRoot {
  public id: string;
  public title: string = '';
  public contentType: ContentType;
  public status: ContentStatus = ContentStatus.Draft;
  public processingResults?: ProcessingResults;

  constructor(id: string) {
    super();
    this.id = id;
  }

  uploadContent(
    title: string, 
    contentType: ContentType, 
    metadata: any,
    userId: string
  ): void {
    if (this.status !== ContentStatus.Draft) {
      throw new Error('Content can only be uploaded in draft state');
    }

    this.addEvent(new DomainEvent(
      'ContentUploaded',
      this.id,
      'Content',
      {
        contentId: this.id,
        title,
        contentType,
        metadata,
        userId
      },
      {
        correlationId: generateId(),
        causationId: generateId(),
        userId
      }
    ));
  }

  startProcessing(processingOptions: ProcessingOptions): void {
    if (this.status !== ContentStatus.Uploaded) {
      throw new Error('Content must be uploaded before processing');
    }

    this.addEvent(new DomainEvent(
      'ContentProcessingStarted',
      this.id,
      'Content',
      {
        contentId: this.id,
        processingOptions
      }
    ));
  }

  completeProcessing(results: ProcessingResults): void {
    if (this.status !== ContentStatus.Processing) {
      throw new Error('Content must be in processing state');
    }

    this.addEvent(new DomainEvent(
      'ContentProcessingCompleted',
      this.id,
      'Content',
      {
        contentId: this.id,
        results,
        processingDuration: results.processingTime
      }
    ));
  }

  apply(event: DomainEvent): void {
    switch (event.type) {
      case 'ContentUploaded':
        this.title = event.data.title;
        this.contentType = event.data.contentType;
        this.status = ContentStatus.Uploaded;
        break;
      case 'ContentProcessingStarted':
        this.status = ContentStatus.Processing;
        break;
      case 'ContentProcessingCompleted':
        this.status = ContentStatus.Completed;
        this.processingResults = event.data.results;
        break;
    }
  }
}
```

This comprehensive event-driven architecture implementation provides the foundation for building a scalable, resilient, and maintainable multimodal education system with proper event sourcing, CQRS patterns, and robust event handling mechanisms.