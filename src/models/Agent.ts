import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AgentType {
  TEXT_PROCESSOR = 'text_processor',
  VISION_ANALYZER = 'vision_analyzer',
  SPEECH_PROCESSOR = 'speech_processor',
  TUTOR = 'tutor',
  ASSESSOR = 'assessor'
}

export enum AgentStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance'
}

@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: AgentType
  })
  type: AgentType;

  @Column('text', { array: true })
  capabilities: string[];

  @Column({
    type: 'enum',
    enum: AgentStatus,
    default: AgentStatus.AVAILABLE
  })
  status: AgentStatus;

  @Column('jsonb')
  configuration: {
    modelName: string;
    temperature: number;
    maxTokens: number;
    specializedPrompts: Record<string, string>;
  };

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
