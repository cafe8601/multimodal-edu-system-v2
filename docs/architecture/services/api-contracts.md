# API Contracts and Interface Definitions

## Overview

This document defines the comprehensive API contracts for all services in the multimodal education system, including REST APIs, GraphQL schemas, gRPC interfaces, and event schemas.

## API Design Principles

### RESTful API Standards
- **HTTP Methods**: Proper use of GET, POST, PUT, DELETE, PATCH
- **Status Codes**: Consistent HTTP status code usage
- **Resource Naming**: Noun-based, hierarchical resource paths
- **Versioning**: URL-based versioning (e.g., `/api/v1/`)
- **Content Types**: JSON primary, support for multipart/form-data

### Error Handling Standards
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "request_id": "req_12345",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Pagination Standards
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total_pages": 15,
    "total_items": 300,
    "has_next": true,
    "has_previous": false
  },
  "links": {
    "self": "/api/v1/users?page=1",
    "next": "/api/v1/users?page=2",
    "last": "/api/v1/users?page=15"
  }
}
```

## Core API Specifications

### 1. Authentication Service API

```yaml
openapi: 3.0.3
info:
  title: Authentication Service API
  version: 1.0.0
  description: User authentication and authorization management

servers:
  - url: https://auth.eduai.com/api/v1

paths:
  /auth/register:
    post:
      summary: Register new user
      tags: [Authentication]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - password
                - username
              properties:
                email:
                  type: string
                  format: email
                  example: "user@example.com"
                password:
                  type: string
                  minLength: 8
                  example: "SecurePass123!"
                username:
                  type: string
                  minLength: 3
                  example: "john_doe"
                profile:
                  $ref: '#/components/schemas/UserProfile'
      responses:
        '201':
          description: User registered successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  user_id:
                    type: string
                  email:
                    type: string
                  verification_required:
                    type: boolean
        '400':
          description: Invalid request data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: User already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/login:
    post:
      summary: Authenticate user
      tags: [Authentication]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - password
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                remember_me:
                  type: boolean
                  default: false
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token:
                    type: string
                    description: JWT access token
                  refresh_token:
                    type: string
                    description: Refresh token for obtaining new access tokens
                  expires_in:
                    type: integer
                    description: Token expiration time in seconds
                  token_type:
                    type: string
                    example: "Bearer"
                  user:
                    $ref: '#/components/schemas/User'
        '401':
          description: Invalid credentials
        '429':
          description: Too many login attempts

  /auth/refresh:
    post:
      summary: Refresh access token
      tags: [Authentication]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - refresh_token
              properties:
                refresh_token:
                  type: string
      responses:
        '200':
          description: Token refreshed successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token:
                    type: string
                  expires_in:
                    type: integer
        '401':
          description: Invalid refresh token

  /auth/logout:
    post:
      summary: Logout user
      tags: [Authentication]
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Logout successful
        '401':
          description: Invalid token

  /auth/verify-token:
    post:
      summary: Verify JWT token
      tags: [Authentication]
      security:
        - BearerAuth: []
      responses:
        '200':
          description: Token is valid
          content:
            application/json:
              schema:
                type: object
                properties:
                  valid:
                    type: boolean
                  user_id:
                    type: string
                  permissions:
                    type: array
                    items:
                      type: string
        '401':
          description: Token is invalid

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
        username:
          type: string
        profile:
          $ref: '#/components/schemas/UserProfile'
        roles:
          type: array
          items:
            type: string
        created_at:
          type: string
          format: date-time
        last_login:
          type: string
          format: date-time

    UserProfile:
      type: object
      properties:
        first_name:
          type: string
        last_name:
          type: string
        avatar_url:
          type: string
        preferences:
          type: object
        timezone:
          type: string

    Error:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: array
          items:
            type: object
        request_id:
          type: string
        timestamp:
          type: string
          format: date-time

  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### 2. Content Processing Service API

```yaml
openapi: 3.0.3
info:
  title: Content Processing Service API
  version: 1.0.0
  description: Multimodal content processing and analysis

paths:
  /content:
    post:
      summary: Upload and process content
      tags: [Content Processing]
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                  description: Content file (image, audio, document)
                content_type:
                  type: string
                  enum: [text, image, audio, document, video]
                  description: Type of content being uploaded
                metadata:
                  type: object
                  description: Additional metadata for the content
                  properties:
                    title:
                      type: string
                    description:
                      type: string
                    tags:
                      type: array
                      items:
                        type: string
                    language:
                      type: string
                      example: "en"
                processing_options:
                  type: object
                  description: Processing configuration options
                  properties:
                    extract_text:
                      type: boolean
                      default: true
                    analyze_sentiment:
                      type: boolean
                      default: true
                    extract_entities:
                      type: boolean
                      default: true
                    generate_summary:
                      type: boolean
                      default: false
      responses:
        '202':
          description: Content accepted for processing
          content:
            application/json:
              schema:
                type: object
                properties:
                  content_id:
                    type: string
                    description: Unique identifier for the content
                  status:
                    type: string
                    enum: [queued, processing, completed, failed]
                  estimated_processing_time:
                    type: integer
                    description: Estimated processing time in seconds
                  webhook_url:
                    type: string
                    description: URL for processing completion notification
        '400':
          description: Invalid content or unsupported format
        '413':
          description: Content too large

  /content/{content_id}:
    get:
      summary: Get content processing results
      tags: [Content Processing]
      security:
        - BearerAuth: []
      parameters:
        - name: content_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Content processing results
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProcessedContent'
        '404':
          description: Content not found
        '202':
          description: Processing still in progress
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                  progress:
                    type: integer
                    minimum: 0
                    maximum: 100
                  estimated_completion:
                    type: string
                    format: date-time

  /content/{content_id}/status:
    get:
      summary: Get content processing status
      tags: [Content Processing]
      security:
        - BearerAuth: []
      parameters:
        - name: content_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Processing status
          content:
            application/json:
              schema:
                type: object
                properties:
                  content_id:
                    type: string
                  status:
                    type: string
                    enum: [queued, processing, completed, failed]
                  progress:
                    type: integer
                  current_stage:
                    type: string
                  error_message:
                    type: string
                  started_at:
                    type: string
                    format: date-time
                  completed_at:
                    type: string
                    format: date-time

  /content/batch:
    post:
      summary: Process multiple content items
      tags: [Content Processing]
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                content_items:
                  type: array
                  items:
                    type: object
                    properties:
                      file_url:
                        type: string
                      content_type:
                        type: string
                      metadata:
                        type: object
                batch_options:
                  type: object
                  properties:
                    priority:
                      type: string
                      enum: [low, normal, high]
                    callback_url:
                      type: string
      responses:
        '202':
          description: Batch processing started
          content:
            application/json:
              schema:
                type: object
                properties:
                  batch_id:
                    type: string
                  content_ids:
                    type: array
                    items:
                      type: string
                  status:
                    type: string

components:
  schemas:
    ProcessedContent:
      type: object
      properties:
        content_id:
          type: string
        original_file:
          type: object
          properties:
            url:
              type: string
            size:
              type: integer
            mime_type:
              type: string
        processing_results:
          type: object
          properties:
            extracted_text:
              type: string
            language:
              type: string
            sentiment:
              type: object
              properties:
                score:
                  type: number
                  minimum: -1
                  maximum: 1
                label:
                  type: string
                  enum: [positive, negative, neutral]
            entities:
              type: array
              items:
                type: object
                properties:
                  text:
                    type: string
                  type:
                    type: string
                  confidence:
                    type: number
            topics:
              type: array
              items:
                type: object
                properties:
                  name:
                    type: string
                  confidence:
                    type: number
            summary:
              type: string
            keywords:
              type: array
              items:
                type: string
        metadata:
          type: object
        processing_time:
          type: integer
          description: Processing time in milliseconds
        created_at:
          type: string
          format: date-time
        completed_at:
          type: string
          format: date-time
```

### 3. Agent Orchestration Service API

```yaml
openapi: 3.0.3
info:
  title: Agent Orchestration Service API
  version: 1.0.0
  description: AI agent coordination and task management

paths:
  /agents:
    get:
      summary: List available agents
      tags: [Agents]
      security:
        - BearerAuth: []
      parameters:
        - name: type
          in: query
          schema:
            type: string
            enum: [researcher, analyzer, creator, reviewer, coordinator]
        - name: status
          in: query
          schema:
            type: string
            enum: [available, busy, offline]
      responses:
        '200':
          description: List of agents
          content:
            application/json:
              schema:
                type: object
                properties:
                  agents:
                    type: array
                    items:
                      $ref: '#/components/schemas/Agent'
                  total_count:
                    type: integer

    post:
      summary: Create or spawn new agent
      tags: [Agents]
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - type
                - capabilities
              properties:
                type:
                  type: string
                  enum: [researcher, analyzer, creator, reviewer, coordinator]
                capabilities:
                  type: array
                  items:
                    type: string
                configuration:
                  type: object
                  properties:
                    max_concurrent_tasks:
                      type: integer
                      default: 5
                    timeout:
                      type: integer
                      default: 300
                    priority_level:
                      type: string
                      enum: [low, normal, high]
      responses:
        '201':
          description: Agent created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Agent'

  /agents/{agent_id}:
    get:
      summary: Get agent details
      tags: [Agents]
      security:
        - BearerAuth: []
      parameters:
        - name: agent_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Agent details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Agent'

    delete:
      summary: Terminate agent
      tags: [Agents]
      security:
        - BearerAuth: []
      parameters:
        - name: agent_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Agent terminated successfully

  /tasks:
    post:
      summary: Submit task for processing
      tags: [Tasks]
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - type
                - payload
              properties:
                type:
                  type: string
                  description: Type of task to be executed
                  example: "content_analysis"
                payload:
                  type: object
                  description: Task-specific data and parameters
                  example:
                    content_id: "content_123"
                    analysis_type: "sentiment"
                priority:
                  type: string
                  enum: [low, normal, high, critical]
                  default: normal
                agent_requirements:
                  type: object
                  properties:
                    agent_type:
                      type: string
                    capabilities:
                      type: array
                      items:
                        type: string
                    max_agents:
                      type: integer
                timeout:
                  type: integer
                  description: Task timeout in seconds
                  default: 300
                callback_url:
                  type: string
                  description: URL to notify when task is completed
      responses:
        '202':
          description: Task accepted for processing
          content:
            application/json:
              schema:
                type: object
                properties:
                  task_id:
                    type: string
                  status:
                    type: string
                  estimated_completion:
                    type: string
                    format: date-time
                  assigned_agents:
                    type: array
                    items:
                      type: string

    get:
      summary: List tasks
      tags: [Tasks]
      security:
        - BearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [queued, running, completed, failed]
        - name: agent_id
          in: query
          schema:
            type: string
        - name: priority
          in: query
          schema:
            type: string
            enum: [low, normal, high, critical]
      responses:
        '200':
          description: List of tasks
          content:
            application/json:
              schema:
                type: object
                properties:
                  tasks:
                    type: array
                    items:
                      $ref: '#/components/schemas/Task'
                  pagination:
                    $ref: '#/components/schemas/Pagination'

  /tasks/{task_id}:
    get:
      summary: Get task status and results
      tags: [Tasks]
      security:
        - BearerAuth: []
      parameters:
        - name: task_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Task details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'

    delete:
      summary: Cancel task
      tags: [Tasks]
      security:
        - BearerAuth: []
      parameters:
        - name: task_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Task cancelled successfully
        '400':
          description: Task cannot be cancelled (already completed)

components:
  schemas:
    Agent:
      type: object
      properties:
        id:
          type: string
        type:
          type: string
          enum: [researcher, analyzer, creator, reviewer, coordinator]
        status:
          type: string
          enum: [available, busy, offline]
        capabilities:
          type: array
          items:
            type: string
        current_tasks:
          type: array
          items:
            type: string
        metrics:
          type: object
          properties:
            tasks_completed:
              type: integer
            average_processing_time:
              type: number
            success_rate:
              type: number
            last_active:
              type: string
              format: date-time
        created_at:
          type: string
          format: date-time

    Task:
      type: object
      properties:
        id:
          type: string
        type:
          type: string
        status:
          type: string
          enum: [queued, running, completed, failed, cancelled]
        priority:
          type: string
          enum: [low, normal, high, critical]
        payload:
          type: object
        result:
          type: object
          properties:
            data:
              type: object
            metadata:
              type: object
            execution_time:
              type: number
        assigned_agents:
          type: array
          items:
            type: string
        error_message:
          type: string
        created_at:
          type: string
          format: date-time
        started_at:
          type: string
          format: date-time
        completed_at:
          type: string
          format: date-time

    Pagination:
      type: object
      properties:
        page:
          type: integer
        per_page:
          type: integer
        total_pages:
          type: integer
        total_items:
          type: integer
        has_next:
          type: boolean
        has_previous:
          type: boolean
```

## GraphQL Schema Definition

```graphql
"""
Multimodal Education System GraphQL Schema
"""

type Query {
  """Get user profile and learning progress"""
  user(id: ID!): User
  
  """Search for learning content"""
  searchContent(
    query: String!
    filters: ContentFilters
    pagination: PaginationInput
  ): ContentSearchResult!
  
  """Get available learning paths"""
  learningPaths(
    difficulty: DifficultyLevel
    category: String
  ): [LearningPath!]!
  
  """Get active agents"""
  agents(filter: AgentFilter): [Agent!]!
  
  """Get task status"""
  task(id: ID!): Task
  
  """Get content processing results"""
  processedContent(id: ID!): ProcessedContent
}

type Mutation {
  """Register new user"""
  registerUser(input: RegisterUserInput!): AuthResult!
  
  """Authenticate user"""
  login(email: String!, password: String!): AuthResult!
  
  """Upload and process content"""
  uploadContent(input: ContentUploadInput!): ContentUploadResult!
  
  """Submit task to agents"""
  submitTask(input: TaskInput!): TaskSubmissionResult!
  
  """Start learning session"""
  startLearningSession(learningPathId: ID!): LearningSession!
  
  """Submit assessment answers"""
  submitAssessment(input: AssessmentSubmissionInput!): AssessmentResult!
}

type Subscription {
  """Real-time task updates"""
  taskUpdates(taskId: ID!): TaskUpdate!
  
  """Content processing progress"""
  contentProcessingProgress(contentId: ID!): ProcessingProgress!
  
  """Learning session updates"""
  learningSessionUpdates(sessionId: ID!): LearningSessionUpdate!
  
  """Agent status changes"""
  agentStatusUpdates(agentId: ID): AgentStatusUpdate!
}

"""User types"""
type User {
  id: ID!
  email: String!
  username: String!
  profile: UserProfile!
  learningProgress: [LearningProgress!]!
  preferences: UserPreferences!
  createdAt: DateTime!
  lastLogin: DateTime
}

type UserProfile {
  firstName: String
  lastName: String
  avatarUrl: String
  timezone: String
}

"""Content types"""
type ProcessedContent {
  id: ID!
  originalFile: FileInfo!
  contentType: ContentType!
  processingResults: ProcessingResults!
  metadata: JSON!
  status: ProcessingStatus!
  createdAt: DateTime!
  completedAt: DateTime
}

enum ContentType {
  TEXT
  IMAGE
  AUDIO
  DOCUMENT
  VIDEO
}

type ProcessingResults {
  extractedText: String
  language: String
  sentiment: SentimentAnalysis
  entities: [Entity!]!
  topics: [Topic!]!
  summary: String
  keywords: [String!]!
}

"""Learning types"""
type LearningPath {
  id: ID!
  title: String!
  description: String!
  difficulty: DifficultyLevel!
  modules: [Module!]!
  estimatedDuration: Int!
  prerequisites: [String!]!
}

type Module {
  id: ID!
  title: String!
  content: ModuleContent!
  assessments: [Assessment!]!
  sequence: Int!
}

enum DifficultyLevel {
  BEGINNER
  INTERMEDIATE
  ADVANCED
  EXPERT
}

"""Agent types"""
type Agent {
  id: ID!
  type: AgentType!
  status: AgentStatus!
  capabilities: [String!]!
  currentTasks: [String!]!
  metrics: AgentMetrics!
  createdAt: DateTime!
}

enum AgentType {
  RESEARCHER
  ANALYZER
  CREATOR
  REVIEWER
  COORDINATOR
}

enum AgentStatus {
  AVAILABLE
  BUSY
  OFFLINE
}

"""Task types"""
type Task {
  id: ID!
  type: String!
  status: TaskStatus!
  priority: TaskPriority!
  payload: JSON!
  result: TaskResult
  assignedAgents: [Agent!]!
  createdAt: DateTime!
  startedAt: DateTime
  completedAt: DateTime
}

enum TaskStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

enum TaskPriority {
  LOW
  NORMAL
  HIGH
  CRITICAL
}

"""Input types"""
input RegisterUserInput {
  email: String!
  password: String!
  username: String!
  profile: UserProfileInput
}

input ContentUploadInput {
  file: Upload!
  contentType: ContentType!
  metadata: JSON
  processingOptions: ProcessingOptionsInput
}

input TaskInput {
  type: String!
  payload: JSON!
  priority: TaskPriority = NORMAL
  agentRequirements: AgentRequirementsInput
  timeout: Int
}

"""Custom scalars"""
scalar DateTime
scalar JSON
scalar Upload

"""Result types"""
type AuthResult {
  token: String!
  refreshToken: String!
  user: User!
  expiresIn: Int!
}

type ContentUploadResult {
  contentId: ID!
  status: ProcessingStatus!
  estimatedProcessingTime: Int
}

type TaskSubmissionResult {
  taskId: ID!
  status: TaskStatus!
  assignedAgents: [Agent!]!
}
```

## Event Schema Definitions

### Kafka Event Schemas (Avro)

```json
{
  "type": "record",
  "name": "ContentProcessedEvent",
  "namespace": "com.eduai.events",
  "fields": [
    {
      "name": "event_id",
      "type": "string"
    },
    {
      "name": "content_id",
      "type": "string"
    },
    {
      "name": "user_id",
      "type": "string"
    },
    {
      "name": "content_type",
      "type": {
        "type": "enum",
        "name": "ContentType",
        "symbols": ["TEXT", "IMAGE", "AUDIO", "DOCUMENT", "VIDEO"]
      }
    },
    {
      "name": "processing_status",
      "type": {
        "type": "enum",
        "name": "ProcessingStatus",
        "symbols": ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]
      }
    },
    {
      "name": "processing_results",
      "type": ["null", {
        "type": "record",
        "name": "ProcessingResults",
        "fields": [
          {"name": "extracted_text", "type": ["null", "string"]},
          {"name": "sentiment_score", "type": ["null", "float"]},
          {"name": "entities", "type": {"type": "array", "items": "string"}},
          {"name": "topics", "type": {"type": "array", "items": "string"}},
          {"name": "confidence", "type": "float"}
        ]
      }]
    },
    {
      "name": "timestamp",
      "type": {
        "type": "long",
        "logicalType": "timestamp-millis"
      }
    },
    {
      "name": "metadata",
      "type": {"type": "map", "values": "string"}
    }
  ]
}
```

```json
{
  "type": "record",
  "name": "TaskCompletedEvent",
  "namespace": "com.eduai.events",
  "fields": [
    {"name": "event_id", "type": "string"},
    {"name": "task_id", "type": "string"},
    {"name": "agent_id", "type": "string"},
    {"name": "task_type", "type": "string"},
    {"name": "status", "type": {
      "type": "enum",
      "name": "TaskStatus",
      "symbols": ["COMPLETED", "FAILED", "CANCELLED"]
    }},
    {"name": "execution_time_ms", "type": "long"},
    {"name": "result", "type": ["null", {"type": "map", "values": "string"}]},
    {"name": "error_message", "type": ["null", "string"]},
    {"name": "timestamp", "type": {
      "type": "long",
      "logicalType": "timestamp-millis"
    }}
  ]
}
```

### WebSocket Message Schemas

```typescript
// Real-time notification schema
interface WebSocketMessage {
  type: 'notification' | 'task_update' | 'content_status' | 'agent_status';
  id: string;
  timestamp: string;
  payload: NotificationPayload | TaskUpdatePayload | ContentStatusPayload | AgentStatusPayload;
}

interface NotificationPayload {
  user_id: string;
  title: string;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  action_url?: string;
}

interface TaskUpdatePayload {
  task_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error_message?: string;
}

interface ContentStatusPayload {
  content_id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
}

interface AgentStatusPayload {
  agent_id: string;
  status: 'available' | 'busy' | 'offline';
  current_task?: string;
  metrics: {
    tasks_completed: number;
    average_processing_time: number;
    success_rate: number;
  };
}
```

## gRPC Service Definitions

```protobuf
syntax = "proto3";

package eduai.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";

// Agent Orchestration Service
service AgentOrchestrationService {
  rpc ListAgents(ListAgentsRequest) returns (ListAgentsResponse);
  rpc CreateAgent(CreateAgentRequest) returns (Agent);
  rpc GetAgent(GetAgentRequest) returns (Agent);
  rpc DeleteAgent(DeleteAgentRequest) returns (google.protobuf.Empty);
  
  rpc SubmitTask(SubmitTaskRequest) returns (TaskSubmissionResponse);
  rpc GetTask(GetTaskRequest) returns (Task);
  rpc CancelTask(CancelTaskRequest) returns (google.protobuf.Empty);
  rpc ListTasks(ListTasksRequest) returns (ListTasksResponse);
  
  rpc StreamTaskUpdates(TaskUpdatesRequest) returns (stream TaskUpdate);
  rpc StreamAgentStatus(AgentStatusRequest) returns (stream AgentStatusUpdate);
}

message Agent {
  string id = 1;
  AgentType type = 2;
  AgentStatus status = 3;
  repeated string capabilities = 4;
  repeated string current_tasks = 5;
  AgentMetrics metrics = 6;
  google.protobuf.Timestamp created_at = 7;
}

enum AgentType {
  AGENT_TYPE_UNSPECIFIED = 0;
  AGENT_TYPE_RESEARCHER = 1;
  AGENT_TYPE_ANALYZER = 2;
  AGENT_TYPE_CREATOR = 3;
  AGENT_TYPE_REVIEWER = 4;
  AGENT_TYPE_COORDINATOR = 5;
}

enum AgentStatus {
  AGENT_STATUS_UNSPECIFIED = 0;
  AGENT_STATUS_AVAILABLE = 1;
  AGENT_STATUS_BUSY = 2;
  AGENT_STATUS_OFFLINE = 3;
}

message Task {
  string id = 1;
  string type = 2;
  TaskStatus status = 3;
  TaskPriority priority = 4;
  bytes payload = 5;
  TaskResult result = 6;
  repeated string assigned_agents = 7;
  google.protobuf.Timestamp created_at = 8;
  google.protobuf.Timestamp started_at = 9;
  google.protobuf.Timestamp completed_at = 10;
}

enum TaskStatus {
  TASK_STATUS_UNSPECIFIED = 0;
  TASK_STATUS_QUEUED = 1;
  TASK_STATUS_RUNNING = 2;
  TASK_STATUS_COMPLETED = 3;
  TASK_STATUS_FAILED = 4;
  TASK_STATUS_CANCELLED = 5;
}

enum TaskPriority {
  TASK_PRIORITY_UNSPECIFIED = 0;
  TASK_PRIORITY_LOW = 1;
  TASK_PRIORITY_NORMAL = 2;
  TASK_PRIORITY_HIGH = 3;
  TASK_PRIORITY_CRITICAL = 4;
}

// Content Processing Service
service ContentProcessingService {
  rpc ProcessContent(ProcessContentRequest) returns (ProcessContentResponse);
  rpc GetProcessingStatus(GetProcessingStatusRequest) returns (ProcessingStatus);
  rpc GetProcessedContent(GetProcessedContentRequest) returns (ProcessedContent);
  rpc StreamProcessingUpdates(ProcessingUpdatesRequest) returns (stream ProcessingUpdate);
}

message ProcessContentRequest {
  bytes content_data = 1;
  ContentType content_type = 2;
  map<string, string> metadata = 3;
  ProcessingOptions options = 4;
}

enum ContentType {
  CONTENT_TYPE_UNSPECIFIED = 0;
  CONTENT_TYPE_TEXT = 1;
  CONTENT_TYPE_IMAGE = 2;
  CONTENT_TYPE_AUDIO = 3;
  CONTENT_TYPE_DOCUMENT = 4;
  CONTENT_TYPE_VIDEO = 5;
}

message ProcessingOptions {
  bool extract_text = 1;
  bool analyze_sentiment = 2;
  bool extract_entities = 3;
  bool generate_summary = 4;
  string target_language = 5;
}
```

This comprehensive API documentation provides the foundation for implementing consistent, well-defined interfaces across all services in the multimodal education system.