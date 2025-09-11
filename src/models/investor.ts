import mongoose, { Document, Schema } from 'mongoose';

export interface IInvestor extends Document {
    name: string;
    age: number;
    email: string;
    nic: string;
}

const investorSchema: Schema<IInvestor> = new Schema({
    name: { type: String },
    age: { type: Number },
    email: { type: String },
    nic: { type: String, required: true, unique: true, minlength: [12, 'NIC should be longer'] }
});

export default mongoose.model<IInvestor>('Investor', investorSchema);
