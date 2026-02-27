import { Schema, model, type InferSchemaType } from 'mongoose';

const watchedUserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    addedBy: { type: Number, required: true },
    isLive: { type: Boolean, default: false },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type IWatchedUser = InferSchemaType<typeof watchedUserSchema>;
export const WatchedUser = model('WatchedUser', watchedUserSchema);
