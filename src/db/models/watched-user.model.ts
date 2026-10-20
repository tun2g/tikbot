import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * - unknown:  not checked yet
 * - live:     connected to the live stream
 * - offline:  not live (or TikTok gave no live stream for this username)
 * - error:    the TikTok signing service refused the connection — see lastError
 */
export const CONNECTION_STATES = ['unknown', 'live', 'offline', 'error'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

const watchedUserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    addedBy: { type: Number, required: true },
    connectionState: { type: String, enum: CONNECTION_STATES, default: 'unknown' },
    lastError: { type: String, default: '' },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type IWatchedUser = InferSchemaType<typeof watchedUserSchema>;
export const WatchedUser = model('WatchedUser', watchedUserSchema);
