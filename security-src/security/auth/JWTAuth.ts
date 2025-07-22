import jwt from 'jsonwebtoken';
import { User } from '@/models/User';

export interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export class JWTAuth {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'default-access-secret';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret';
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
  }

  generateAccessToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'multimodal-edu-system',
      audience: 'multimodal-edu-client',
    });
  }

  generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
    });
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.accessTokenSecret, {
        issuer: 'multimodal-edu-system',
        audience: 'multimodal-edu-client',
      }) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  verifyRefreshToken(token: string): { userId: string } {
    try {
      return jwt.verify(token, this.refreshTokenSecret) as { userId: string };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async refreshTokens(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const { userId } = this.verifyRefreshToken(refreshToken);
    // Fetch user from database (mock for now)
    const user = await this.getUserById(userId);
    
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(userId),
    };
  }

  private async getUserById(userId: string): Promise<User> {
    // Mock implementation - replace with actual database query
    return {
      id: userId,
      email: 'user@example.com',
      roles: ['student'],
    } as User;
  }
}
