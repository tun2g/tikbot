import type { Context } from 'telegraf';
import type { TikTokService } from '@/services/tiktok.service.js';
import type { ConnectionManager } from '@/tiktok/connection-manager.js';

export interface UserSession {
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastActivity: Date;
}

export interface BotContext extends Context {
  tiktokService: TikTokService;
  connectionManager: ConnectionManager;
  session?: UserSession;
  requestId: string;
}
