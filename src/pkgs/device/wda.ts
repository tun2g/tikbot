import { logger } from '@/utils/logger.js';
import type { DeviceDriver } from './types.js';

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class WdaError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'WdaError';
  }
}

// ---------------------------------------------------------------------------
// WDA DeviceDriver implementation
// ---------------------------------------------------------------------------

export function createWdaDriver(baseUrl: string = 'http://localhost:8100'): DeviceDriver {
  let sessionId: string | null = null;

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  async function request<T = unknown>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${baseUrl}${path}`;
    logger.debug({ method, url }, 'wda: request');

    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      throw new WdaError(`WDA request failed: ${method} ${path} → ${res.status}`, path, res.status);
    }

    const json = (await res.json()) as T;
    return json;
  }

  async function createSession(): Promise<string> {
    logger.debug('wda: creating session');
    const res = await request<{ value: { sessionId: string }; sessionId?: string }>('POST', '/session', {
      capabilities: {},
    });

    // WDA may return sessionId at top level or inside value
    const id = res.sessionId ?? res.value?.sessionId;
    if (!id) {
      throw new WdaError('WDA session creation returned no sessionId', '/session');
    }

    logger.debug({ sessionId: id }, 'wda: session created');
    return id;
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    sessionId = await createSession();
    return sessionId;
  }

  /**
   * Execute a session-scoped request. If it fails with a session-not-found
   * error (status 6 in WDA), recreate the session and retry once.
   */
  async function sessionRequest<T = unknown>(
    method: string,
    pathFn: (sid: string) => string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const sid = await ensureSession();
    try {
      return await request<T>(method, pathFn(sid), body);
    } catch (err) {
      if (err instanceof WdaError && err.statusCode && err.statusCode >= 400) {
        logger.warn('wda: session may be stale, recreating');
        sessionId = null;
        const newSid = await ensureSession();
        return request<T>(method, pathFn(newSid), body);
      }
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // DeviceDriver interface
  // -----------------------------------------------------------------------

  return {
    async isConnected(): Promise<boolean> {
      logger.debug('wda: checking connection');
      try {
        await request('GET', '/status');
        return true;
      } catch {
        logger.debug('wda: not connected');
        return false;
      }
    },

    async tap(x: number, y: number): Promise<void> {
      logger.debug({ x, y }, 'wda: tap');
      await sessionRequest('POST', (sid) => `/session/${sid}/actions`, {
        actions: [
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              { type: 'pointerMove', duration: 0, x, y },
              { type: 'pointerDown', button: 0 },
              { type: 'pause', duration: 100 },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ],
      });
    },

    async openUrl(url: string): Promise<void> {
      logger.debug({ url }, 'wda: opening url');
      await sessionRequest('POST', (sid) => `/session/${sid}/url`, { url });
    },

    async currentApp(): Promise<string> {
      logger.debug('wda: getting current app');
      const res = await request<{ value: { os?: { name?: string }; build?: { bundleid?: string } } }>('GET', '/status');

      const bundleId = res.value?.build?.bundleid ?? 'unknown';
      logger.debug({ currentApp: bundleId }, 'wda: current app');
      return bundleId;
    },

    async screenshot(): Promise<Buffer> {
      logger.debug('wda: taking screenshot');
      const res = await request<{ value: string }>('GET', '/screenshot');
      const buffer = Buffer.from(res.value, 'base64');
      logger.debug({ bytes: buffer.byteLength }, 'wda: screenshot captured');
      return buffer;
    },
  };
}
