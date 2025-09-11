import mongoose, { Document, Model, Schema } from "mongoose";

export interface ITransaction extends Document {
    date: Date;
    amount: number;
    account: mongoose.Types.ObjectId;
    type: 'credit' | 'debit';
}

const transactionSchema = new Schema<ITransaction>({
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true }
});
const Transaction: Model<ITransaction> = mongoose.model<ITransaction>('Transaction', transactionSchema);
export default Transaction;
