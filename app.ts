import express from 'express';
import investorRouter from './src/routes/invester_route';
import accountRouter from './src/routes/account_route';
import transactionRouter from './src/routes/transaction_route';
import Logger from './src/utils/logger';

// Logging middleware
const requestLogger = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    
    // Log the incoming request
    Logger.info('Incoming Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Log the response when it finishes
    res.on('finish', () => {
        const duration = Date.now() - start;
        Logger.request(req.method, req.url, res.statusCode, duration);
    });

    next();
};

Logger.info('Application starting...');
const app = express();

app.use(express.json());
app.use(requestLogger); // Add request logging middleware

app.use('/investor', investorRouter);
app.use('/account', accountRouter);
app.use('/transaction', transactionRouter);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    Logger.error('Unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    Logger.info(`Server started successfully`, { port, environment: process.env.NODE_ENV || 'development' });
});

export default app;
