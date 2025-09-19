import { Router, Request, Response } from 'express';
import Account from '../models/account';
import { createClient } from 'redis';

// Initialize Redis client
const redisClient = createClient();
redisClient.connect().catch(console.error);
/**
 * @openapi
 * /account/new-account:
 *   post:
 *     summary: Create a new account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               investor:
 *                 type: string
 *               money:
 *                 type: number
 *               accountNumber:
 *                 type: number
 *     responses:
 *       201:
 *         description: Account added successfully
 *       400:
 *         description: Missing required account fields
 *       409:
 *         description: Account with this account number already exists
 *       500:
 *         description: Failed to add account
 */
const routerAccount = Router();

routerAccount.post('/new-account', async (req: Request, res: Response) => {
    try {
        const accountData = req.body;
        // Validate required fields (example: investor, money, accountNumber)
        if (!accountData.investor || typeof accountData.money !== 'number' || !accountData.accountNumber) {
            return res.status(400).json({ error: 'Missing required account fields' });
        }
        // Check if account number already exists
        const existingAccount = await Account.findOne({ accountNumber: accountData.accountNumber });
        if (existingAccount) {
            return res.status(409).json({ error: 'Account with this account number already exists' });
        }
        const newAccount = new Account(accountData);
        await newAccount.save();
        res.status(201).json({ message: 'Account added successfully', account: newAccount });
    } catch (err) {
        if (err.name === "ValidationError") {
            return res.status(400).json({ error: "ValidationError" });
        }
        console.log(err);
        res.status(500).json({ error: 'Failed to add account' });
    }
});

routerAccount.get('/get', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /account/get:
     *   get:
     *     summary: Get account by account number
     *     parameters:
     *       - in: query
     *         name: accountNumber
     *         required: true
     *         schema:
     *           type: number
     *         description: Account number to retrieve
     *     responses:
     *       200:
     *         description: Account found
     *       400:
     *         description: accountNumber is required
     *       404:
     *         description: Account not found
     */
    try {
        const { accountNumber } = req.query;
        if (!accountNumber) {
            return res.status(400).json({ error: 'accountNumber is required as query parameter' });
        }

        // Check cache first
        const cacheKey = `account:${accountNumber}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            const cachedStr = typeof cached === 'string' ? cached : cached.toString();
            return res.status(200).json({ account: JSON.parse(cachedStr), cached: true });
        }

        const account = await Account.findOne({ accountNumber: Number(accountNumber) });
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const populatedAccount = await account.populate('investor');

        // Cache the result for 1 hour
        await redisClient.set(cacheKey, JSON.stringify(populatedAccount), { EX: 3600 });

        res.status(200).json({ account: populatedAccount });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to retrieve account' });
    }
});

routerAccount.delete('/delete', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /account/delete:
     *   delete:
     *     summary: Delete account by ID or account number
     *     parameters:
     *       - in: query
     *         name: accountId
     *         required: false
     *         schema:
     *           type: string
     *         description: Account ID to delete
     *       - in: query
     *         name: accountNumber
     *         required: false
     *         schema:
     *           type: number
     *         description: Account number to delete
     *     responses:
     *       200:
     *         description: Account deleted successfully
     *       400:
     *         description: accountId or accountNumber is required
     *       404:
     *         description: Account not found
     *       500:
     *         description: Failed to delete account
     */
    const { accountId, accountNumber } = req.query;
    if (!accountId && !accountNumber) {
        return res.status(400).json({ error: 'accountId or accountNumber is required as query parameter' });
    }
    try {
        // Find the account first to get accountNumber for cache invalidation
        const account = await Account.findOne({
            $or: [
                accountId ? { _id: accountId } : {},
                accountNumber ? { accountNumber: Number(accountNumber) } : {}
            ]
        });
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Delete the account
        await account.deleteOne();

        // Invalidate cache
        await redisClient.del(`account:${account.accountNumber}`);

        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});


/**
 * @openapi
 * /account/update:
 *   put:
 *     summary: Update account info
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *               accountNumber:
 *                 type: number
 *               investor:
 *                 type: string
 *               money:
 *                 type: number
 *     responses:
 *       200:
 *         description: Account updated successfully
 *       400:
 *         description: accountId or accountNumber is required
 *       404:
 *         description: Account not found
 *       500:
 *         description: Failed to update account
 */
routerAccount.put('/update', async (req: Request, res: Response) => {
    try {
        const { accountId, accountNumber, ...updateData } = req.body;
        if (!accountId && !accountNumber) {
            return res.status(400).json({ error: 'accountId or accountNumber is required' });
        }
        // Find the account
        const account = await Account.findOne({
            $or: [
                accountId ? { _id: accountId } : {},
                accountNumber ? { accountNumber: accountNumber } : {}
            ]
        });
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }
        account.set(updateData);
        await account.save();

        // Invalidate cache
        await redisClient.del(`account:${account.accountNumber}`);

        res.status(200).json({ message: 'Account updated successfully', account });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

export default routerAccount;