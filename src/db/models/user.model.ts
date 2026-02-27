import { Schema, model, type InferSchemaType, type Model } from 'mongoose';

const userSchema = new Schema(
  {
    userId: { type: Number, required: true, unique: true, index: true },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export type IUser = InferSchemaType<typeof userSchema>;

interface UserModel extends Model<IUser> {
  findOrCreate(data: { userId: number; username?: string; firstName?: string; lastName?: string }): Promise<IUser>;
}

userSchema.static(
  'findOrCreate',
  async function (data: { userId: number; username?: string; firstName?: string; lastName?: string }): Promise<IUser> {
    const user = await this.findOneAndUpdate(
      { userId: data.userId },
      {
        $set: {
          username: data.username,
          firstName: data.firstName,
          lastName: data.lastName,
          lastActivity: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return user;
  },
);

export const User = model<IUser, UserModel>('User', userSchema);
