import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Lifecycle of a treasure box from the bot's point of view.
 * - tracking:  reminder (and auto-claim, if enabled) still scheduled
 * - attempted: claim taps were sent — the result is only visible in the screenshot
 * - failed:    the claim sequence errored before the taps were sent
 * - cancelled: a user cancelled it via /pending
 * - lost:      the bot was down when the box opened
 * - untracked: the box opened without a scheduled claim (auto-claim off, or no open time)
 */
export const CLAIM_STATUSES = ['tracking', 'attempted', 'failed', 'cancelled', 'lost', 'untracked'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const envelopeEventSchema = new Schema({
  envelopeId: { type: String, required: true, unique: true },
  username: { type: String, required: true, index: true },
  businessType: { type: Number, required: true },
  sendUserName: { type: String, default: '' },
  sendUserId: { type: String, default: '' },
  diamondCount: { type: Number, required: true },
  peopleCount: { type: Number, default: 0 },
  unpackAt: { type: Date },
  timestamp: { type: Date, default: Date.now },

  /** Telegram message id of the original alert — later messages reply to it. */
  alertMessageId: { type: Number },
  /** Whether auto-claim was scheduled for this box when it appeared. */
  autoClaim: { type: Boolean, default: false },
  claimStatus: { type: String, enum: CLAIM_STATUSES, default: 'tracking', index: true },
  /** Human-readable explanation of the claim outcome. */
  claimNote: { type: String, default: '' },
});

export type IEnvelopeEvent = InferSchemaType<typeof envelopeEventSchema>;
export const EnvelopeEvent = model('EnvelopeEvent', envelopeEventSchema);
