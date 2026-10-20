import type { Context } from 'telegraf';
import type { TikTokService } from '@/services/tiktok.service.js';
import type { ConnectionManager } from '@/pkgs/tiktok/connection-manager.js';
import type { ClaimService } from '@/services/claim.service.js';
import type { NotificationService } from '@/services/notification.service.js';
import type { DeviceDriver } from '@/pkgs/device/types.js';

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
  notifications: NotificationService;
  deviceDriver: DeviceDriver;
  session?: UserSession;
  requestId: string;
}
