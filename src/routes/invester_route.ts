import { Router, Request, Response } from 'express';
import Investor from '../models/investor';
import Account from '../models/account';

const router_investor = Router();
/**
 * @openapi
 * /investor/create:
 *   post:
 *     summary: Create a new investor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nic:
 *                type: string
 *                example: "123456789V"
 *               name:
 *                type: string
 *                example: "John Doe"
 *               age:
 *                type: integer
 *                example: 30
 *               email:
 *                type: string
 *                example: "john.doe@exafmple.com"
 *     responses:
 *       201:
 *         description: Investor added successfully
 *       500: 
 *         description: Failed to add investor
 */
router_investor.post('/create', async (req: Request, res: Response) => {
    try {
        const investorData = req.body;

        const investor = new Investor(investorData);
        await investor.save();
        res.status(201).json({ message: 'Investor added successfully', investor });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to add investor' });
    }
});

router_investor.post('/retrieve', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /investor/retrieve:
     *   post:
     *     summary: Retrieve investor by NIC
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               nic:
     *                 type: string
     *     responses:
     *       200:
     *         description: Investor found
     *       404:
     *         description: Investor not found
     *       500:
     *         description: Failed to retrieve investor
     */
    try {
        const { nic } = req.body;
        const investor = await Investor.findOne({ nic });
        if (!investor) {
            return res.status(404).json({ error: 'Investor not found' });
        }
        res.status(200).json({ investor });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to retrieve investor' });
    }
});

router_investor.post('/delete', async (req: Request, res: Response) => {
    /**
     * @openapi
     * /investor/delete:
     *   post:
     *     summary: Delete investor and associated accounts
     *     requestBody:
     *       required: trues
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               investorId:
     *                 type: string
     *               nic:
     *                 type: string
     *     responses:
     *       200:
     *         description: Investor and associated accounts deleted successfully
     *       400:
     *         description: investorId or nic is required
     *       404:
     *         description: Investor not found
     *       500:
     *         description: Failed to delete investor
     */
    try {
        const { investorId, nic } = req.body;
        if (!investorId && !nic) {
            return res.status(400).json({ error: 'investorId or nic is required' });
        }
        // Find the investor
        const investor = await Investor.findOne({
            $or: [
                investorId ? { _id: investorId } : {},
                nic ? { nic: nic } : {}
            ]
        });
        if (!investor) {
            return res.status(404).json({ error: 'Investor not found' });
        }
        await Account.deleteMany({ investor: investor._id });
        // Delete the investor
        await investor.deleteOne();
        res.status(200).json({ message: 'Investor and associated accounts deleted successfully' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to delete investor' });
    }
});


/**
 * @openapi
 * /investor/update:
 *   post:
 *     summary: Update investor info
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               investorId:
 *                 type: string
 *               nic:
 *                 type: string
 *               name:
 *                 type: string
 *               age:
 *                 type: integer
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Investor updated successfully
 *       400:
 *         description: investorId or nic is required
 *       404:
 *         description: Investor not found
 *       500:
 *         description: Failed to update investor
 */
router_investor.post('/update', async (req: Request, res: Response) => {
    try {
        const { investorId, nic, ...updateData } = req.body;
        if (!investorId && !nic) {
            return res.status(400).json({ error: 'investorId or nic is required' });
        }
        // Find the investor
        const investor = await Investor.findOne({
            $or: [
                investorId ? { _id: investorId } : {},
                nic ? { nic: nic } : {}
            ]
        });
        if (!investor) {
            return res.status(404).json({ error: 'Investor not found' });
        }
        investor.set(updateData);
        await investor.save();
        res.status(200).json({ message: 'Investor updated successfully', investor });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Failed to update investor' });
    }
});

export default router_investor;