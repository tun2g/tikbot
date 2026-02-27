import { Schema, model, type InferSchemaType } from 'mongoose';

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
});

export type IEnvelopeEvent = InferSchemaType<typeof envelopeEventSchema>;
export const EnvelopeEvent = model('EnvelopeEvent', envelopeEventSchema);
