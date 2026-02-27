import pino from 'pino';
import { env } from '@/config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(process.env['NODE_ENV'] !== 'production' && {
    transport: { target: 'pino-pretty' },
  }),
});
