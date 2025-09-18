import { Router, Request, Response } from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import Transaction from '../models/transaction';
import Account from '../models/account';
import { createClient } from 'redis';

/**
 * @openapi
 * /transaction/new:
 *   post:
 *     summary: Create a new transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idempotencyKey:
 *                 type: string
 *               accountNumber:
 *                 type: number
 *               amount:
 *                 type: number
 *               type:
 *                 type: string
 *                 enum: [credit, debit]
 *     responses:
 *       201:
 *         description: Transaction added successfully
 *       400:
 *         description: Insufficient funds or missing fields
 *       404:
 *         description: Account not found
 *       500:
 *         description: Failed to add transaction
 */
const transactionRouter = Router();
// Initialize Redis client
const redisClient = createClient();

redisClient.connect().catch(console.error);

transactionRouter.post('/new', async (req: Request, res: Response) => {
    try {
        const transactionData = req.body;
        const acc = await Account.findOne({ accountNumber: transactionData.accountNumber });
        if (!acc) {
            return res.status(404).json({ error: 'Account not found' });
        }
        if (transactionData.type === 'debit' && acc.money < transactionData.amount) {
            return res.status(400).json({ error: 'Insufficient funds' });
        }
        const newTransaction = new Transaction(transactionData);
        await newTransaction.save();
        if (transactionData.type === 'debit') {
            await Account.findByIdAndUpdate(transactionData.account, { $inc: { money: -transactionData.amount } });
        } else if (transactionData.type === 'credit') {
            await Account.findByIdAndUpdate(transactionData.account, { $inc: { money: transactionData.amount } });
        }
        res.status(201).json({ message: 'Transaction added successfully', transaction: newTransaction });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to add transaction' });
    }
});

const upload = multer({ storage: multer.memoryStorage() });
transactionRouter.post('/new-bulk', upload.single('file'), async (req: Request, res: Response) => {
    /**
     * @openapi
     * /transaction/new-bulk:
     *   post:
     *     summary: Bulk upload transactions via CSV
     *     requestBody:
     *       required: true
     *       content:
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             properties:
     *               file:
     *                 type: string
     *                 format: binary
     *     responses:
     *       201:
     *         description: Transactions added
     *       400:
     *         description: No file uploaded or invalid CSV format
     *       500:
     *         description: Failed to add transactions
     */
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Use a hash of the file buffer as cache key
    const crypto = await import('crypto');
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const cacheKey = `bulk_upload:${fileHash}`;
    // Check cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
        const cachedStr = typeof cached === 'string' ? cached : cached.toString();
        return res.status(200).json(JSON.parse(cachedStr));
    }
    const results: any[] = [];
    const stream = Readable.from(req.file.buffer);
    stream.pipe(csvParser())
        .on('data', (data) => { results.push(data); })
        .on('end', async () => {
            try {
                const inserted = [];
                for (const row of results) {
                    if (!row.amount || !row.account || !row.type) continue;
                    const transaction = new Transaction({
                        idempotencyKey: row.idempotencyKey.toString(),
                        amount: Number(row.amount),
                        accountNumber: Number(row.account),
                        type: row.type.toString()
                    });
                    const acc = await Account.findOne({ accountNumber: transaction.accountNumber });
                    if (!acc) {
                        continue; // Skip if account doesn't exist
                    }
                    if (transaction.type === 'debit' && acc.money > transaction.amount) {
                        acc.money -= transaction.amount;

                    } else if (transaction.type === 'credit') {
                        acc.money += transaction.amount;
                    } else {
                        continue; // Skip if insufficient funds for debit
                    }

                    try {
                        await transaction.save();
                        inserted.push(transaction);
                    } catch (err) {
                        console.log('Failed to save transaction:', row);
                        continue;
                    }
                    await acc.save();
                }
                const response = { message: 'Transactions added', count: inserted.length };
                // Cache the result for 1 hour
                await redisClient.set(cacheKey, JSON.stringify(response), { EX: 3600 });
                res.status(201).json(response);
            } catch (err) {
                console.log(err);
                res.status(500).json({ error: 'Failed to add transactions' });
            }
        })
        .on('error', () => {
            res.status(400).json({ error: 'Invalid CSV format' });
        });
});

transactionRouter.post('/get', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /transaction/get:
     *   post:
     *     summary: Get transaction by ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               transactionId:
     *                 type: string
     *     responses:
     *       200:
     *         description: Transaction found
     *       400:
     *         description: transactionId is required
     *       404:
     *         description: Transaction not found
     */
    const { transactionId } = req.body;
    if (!transactionId) {
        return res.status(400).json({ error: 'transactionId is required' });
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(200).json({ transaction });
});

transactionRouter.post('/reverse', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /transaction/reverse:
     *   post:
     *     summary: Reverse a transaction
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               transactionId:
     *                 type: string
     *     responses:
     *       201:
     *         description: Transaction reversed successfully
     *       400:
     *         description: transactionId is required
     *       404:
     *         description: Transaction not found
     */
    const { transactionId } = req.body;
    if (!transactionId) {
        return res.status(400).json({ error: 'transactionId is required' });
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    // Reverse the transaction
    const reverseTransaction = new Transaction({
        amount: transaction.amount,
        accountNumber: transaction.accountNumber,
        type: transaction.type === 'credit' ? 'debit' : 'credit'
    });
    await reverseTransaction.save();
    if (reverseTransaction.type === 'debit') {
        await Account.findOneAndUpdate({ accountNumber: reverseTransaction.accountNumber }, { $inc: { money: -reverseTransaction.amount } });
    } else if (reverseTransaction.type === 'credit') {
        await Account.findOneAndUpdate({ accountNumber: reverseTransaction.accountNumber }, { $inc: { money: reverseTransaction.amount } });
    }
    res.status(201).json({ message: 'Transaction reversed successfully', transaction: reverseTransaction });
});

export default transactionRouter;