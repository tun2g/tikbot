import type { Context } from 'telegraf';
import type { TikTokService } from '@/services/tiktok.service.js';
import type { ConnectionManager } from '@/pkgs/tiktok/connection-manager.js';
import type { ClaimService } from '@/pkgs/adb/claim.service.js';

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
  claimService: ClaimService;
  session?: UserSession;
  requestId: string;
}
