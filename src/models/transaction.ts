import mongoose, { Document, Model, Schema } from "mongoose";
import Account from "./account";
export interface ITransaction extends Document {
    idempotencyKey: string;
    date: Date;
    amount: number;
    accountNumber: number;
    type: 'credit' | 'debit';
}

const transactionSchema = new Schema<ITransaction>({
    idempotencyKey: { type: String, unique: true },
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    accountNumber: {
        type: Number, required: true, validate: {
            validator: async function (value: number) {
                const accountExists = await Account.exists({ accountNumber: value });
                return !!accountExists;
            },
            message: "Account number does not exist",
        }
    },
    type: { type: String, enum: ['credit', 'debit'], required: true }
});
const Transaction: Model<ITransaction> = mongoose.model<ITransaction>('Transaction', transactionSchema);
export default Transaction;
//redis = remote dictionary server