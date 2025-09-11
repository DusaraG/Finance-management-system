import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAccount extends Document {
    investor: mongoose.Types.ObjectId;
    accountNumber: number;
    money: number;
}

const accountSchema = new Schema<IAccount>({
    accountNumber: { type: Number, required: true, unique: true },
    money: { type: Number, required: true },
    investor: { type: Schema.Types.ObjectId, ref: 'Investor', required: true }
});
export default mongoose.model<IAccount>('Account', accountSchema);
