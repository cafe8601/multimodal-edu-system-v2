import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User';

export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned'
}

@Entity('learning_sessions')
export class LearningSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.sessions)
  user: User;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.ACTIVE
  })
  status: SessionStatus;

  @Column('jsonb')
  objectives: {
    primary: string[];
    secondary: string[];
  };

  @Column('jsonb', { array: true })
  interactions: Array<{
    timestamp: Date;
    agentId: string;
    type: string;
    content: any;
    response: any;
  }>;

  @Column('jsonb', { nullable: true })
  analytics: {
    duration: number;
    interactionCount: number;
    completionRate: number;
    engagementScore: number;
  };

  @CreateDateColumn()
  startedAt: Date;

  @UpdateDateColumn()
  lastActivityAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;
}
