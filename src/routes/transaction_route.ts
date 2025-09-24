import { Router, Request, Response } from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import Transaction from '../models/transaction';
import Account from '../models/account';
import { createClient } from 'redis';
import Logger from '../utils/logger';

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

redisClient.connect().then(() => {
    Logger.info('Redis client connected successfully for transactions');
}).catch((err) => {
    Logger.error('Failed to connect to Redis for transactions', err);
});

transactionRouter.post('/new', async (req: Request, res: Response) => {
    const transactionId = req.body.idempotencyKey || `temp_${Date.now()}`;
    Logger.info('Creating new transaction', {
        transactionId,
        accountNumber: req.body.accountNumber,
        amount: req.body.amount,
        type: req.body.type
    });

    try {
        const transactionData = req.body;

        // Check if idempotencyKey is provided
        if (!transactionData.idempotencyKey) {
            Logger.warn('Transaction creation failed - missing idempotencyKey', { transactionData });
            return res.status(400).json({ error: 'idempotencyKey is required' });
        }

        // Check if transaction with same idempotencyKey already exists
        Logger.debug('Checking for existing transaction', { idempotencyKey: transactionData.idempotencyKey });
        const existingTransaction = await Transaction.findOne({ idempotencyKey: transactionData.idempotencyKey });
        if (existingTransaction) {
            Logger.warn('Duplicate transaction attempt', {
                idempotencyKey: transactionData.idempotencyKey,
                existingTransactionId: existingTransaction._id
            });
            return res.status(409).json({
                error: 'Transaction with this idempotencyKey already exists',
                existingTransaction: existingTransaction
            });
        }

        Logger.debug('Looking up account', { accountNumber: transactionData.accountNumber });
        const acc = await Account.findOne({ accountNumber: transactionData.accountNumber });
        if (!acc) {
            Logger.warn('Transaction failed - account not found', {
                accountNumber: transactionData.accountNumber,
                idempotencyKey: transactionData.idempotencyKey
            });
            return res.status(404).json({ error: 'Account not found' });
        }

        Logger.debug('Account found, checking balance', {
            accountNumber: acc.accountNumber,
            currentBalance: acc.money,
            transactionAmount: transactionData.amount,
            transactionType: transactionData.type
        });

        if (transactionData.type === 'debit' && acc.money < transactionData.amount) {
            Logger.warn('Transaction failed - insufficient funds', {
                accountNumber: acc.accountNumber,
                currentBalance: acc.money,
                requestedAmount: transactionData.amount,
                idempotencyKey: transactionData.idempotencyKey
            });
            return res.status(400).json({ error: 'Insufficient funds' });
        }

        const newTransaction = new Transaction(transactionData);
        Logger.debug('Saving new transaction', {
            transactionId: newTransaction.idempotencyKey,
            accountNumber: newTransaction.accountNumber
        });

        await newTransaction.save();

        const oldBalance = acc.money;
        if (transactionData.type === 'debit') {
            acc.money -= transactionData.amount;
        } else if (transactionData.type === 'credit') {
            acc.money += transactionData.amount;
        }

        Logger.debug('Updating account balance', {
            accountNumber: acc.accountNumber,
            oldBalance,
            newBalance: acc.money,
            transactionAmount: transactionData.amount,
            transactionType: transactionData.type
        });

        await acc.save();

        // Invalidate account cache as balance changed
        await redisClient.del(`account:${transactionData.accountNumber}`);
        Logger.debug('Cache invalidated for account', { accountNumber: transactionData.accountNumber });

        Logger.info('Transaction created successfully', {
            transactionId: newTransaction._id,
            idempotencyKey: newTransaction.idempotencyKey,
            accountNumber: newTransaction.accountNumber,
            amount: newTransaction.amount,
            type: newTransaction.type,
            newAccountBalance: acc.money
        });

        res.status(201).json({ message: 'Transaction added successfully', transaction: newTransaction });
    } catch (err) {
        Logger.error('Failed to create transaction', {
            error: err,
            requestBody: req.body,
            idempotencyKey: req.body?.idempotencyKey
        });
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

    const results: any[] = [];
    const stream = Readable.from(req.file.buffer);
    stream.pipe(csvParser())
        .on('data', (data) => { results.push(data); })
        .on('end', async () => {
            try {
                const inserted = [];
                const skipped = [];
                const failed = [];
                const processedIdempotencyKeys = new Set<string>();

                for (const row of results) {
                    if (!row.amount || !row.account || !row.type || !row.idempotencyKey) {
                        failed.push({ row, reason: 'Missing required fields' });
                        continue;
                    }

                    const idempotencyKey = row.idempotencyKey.toString();

                    // Check if idempotencyKey already exists in database
                    const existingTransaction = await Transaction.findOne({ idempotencyKey });
                    if (existingTransaction) {
                        skipped.push({ row, reason: 'IdempotencyKey already exists in database', existingTransaction });
                        continue;
                    }

                    // Check if idempotencyKey is duplicate within current batch
                    if (processedIdempotencyKeys.has(idempotencyKey)) {
                        skipped.push({ row, reason: 'Duplicate idempotencyKey in current batch' });
                        continue;
                    }

                    processedIdempotencyKeys.add(idempotencyKey);

                    const transaction = new Transaction({
                        idempotencyKey,
                        amount: Number(row.amount),
                        accountNumber: Number(row.account),
                        type: row.type.toString()
                    });

                    const acc = await Account.findOne({ accountNumber: transaction.accountNumber });
                    if (!acc) {
                        failed.push({ row, reason: 'Account not found' });
                        continue;
                    }

                    if (transaction.type === 'debit' && acc.money < transaction.amount) {
                        failed.push({ row, reason: 'Insufficient funds' });
                        continue;
                    }

                    if (transaction.type === 'debit') {
                        acc.money -= transaction.amount;
                    } else if (transaction.type === 'credit') {
                        acc.money += transaction.amount;
                    }

                    try {
                        await transaction.save();
                        await acc.save();
                        inserted.push(transaction);
                        // Invalidate account cache as balance changed
                        await redisClient.del(`account:${transaction.accountNumber}`);
                    } catch (err) {
                        console.log('Failed to save transaction:', row, err);
                        failed.push({ row, reason: 'Database save error', error: err });
                        continue;
                    }
                }
                const response = {
                    message: 'Bulk transaction processing completed',
                    inserted: inserted.length,
                    skipped: skipped.length,
                    failed: failed.length,
                    details: {
                        skippedTransactions: skipped,
                        failedTransactions: failed
                    }
                };

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

transactionRouter.get('/get', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /transaction/get:
     *   get:
     *     summary: Get transaction by ID
     *     parameters:
     *       - in: query
     *         name: transactionId
     *         required: true
     *         schema:
     *           type: string
     *         description: Transaction ID to retrieve
     *     responses:
     *       200:
     *         description: Transaction found
     *       400:
     *         description: transactionId is required
     *       404:
     *         description: Transaction not found
     *       500:
     *         description: Failed to retrieve transaction
     */
    try {
        const { transactionId } = req.query;
        if (!transactionId) {
            return res.status(400).json({ error: 'transactionId is required as query parameter' });
        }

        // Check cache first
        const cacheKey = `transaction:${transactionId}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            const cachedStr = typeof cached === 'string' ? cached : cached.toString();
            return res.status(200).json({ transaction: JSON.parse(cachedStr), cached: true });
        }

        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Cache the result for 1 hour
        await redisClient.set(cacheKey, JSON.stringify(transaction), { EX: 3600 });

        res.status(200).json({ transaction });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to retrieve transaction' });
    }
});

transactionRouter.put('/reverse', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /transaction/reverse:
     *   put:
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
     *       500:
     *         description: Failed to reverse transaction
     */
    try {
        const { transactionId } = req.body;
        if (!transactionId) {
            return res.status(400).json({ error: 'transactionId is required' });
        }
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        // Generate a unique idempotencyKey for the reverse transaction
        const reverseIdempotencyKey = `reverse_${transaction.idempotencyKey}_${Date.now()}`;

        // Reverse the transaction
        const reverseTransaction = new Transaction({
            idempotencyKey: reverseIdempotencyKey,
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

        // Invalidate cache for the original transaction
        await redisClient.del(`transaction:${transactionId}`);
        // Invalidate account cache as balance changed
        await redisClient.del(`account:${transaction.accountNumber}`);

        res.status(201).json({ message: 'Transaction reversed successfully', transaction: reverseTransaction });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to reverse transaction' });
    }
});

export default transactionRouter;