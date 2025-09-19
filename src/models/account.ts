import mongoose, { Document, Model, Schema } from 'mongoose';
import Investor from './investor';
export interface IAccount extends Document {
    investor: mongoose.Types.ObjectId;
    accountNumber: number;
    money: number;
}

const accountSchema = new Schema<IAccount>({
    accountNumber: { type: Number, required: true, unique: true },
    money: { type: Number, required: true },
    investor: {
        type: Schema.Types.ObjectId, ref: 'Investor', required: true, validate: {
            validator: async function (value: mongoose.Types.ObjectId) {
                const investorExists = await Investor.exists({ _id: value });
                return !!investorExists;
            },
            message: "Investor ID does not exist",
        }
    }
});
export default mongoose.model<IAccount>('Account', accountSchema);
