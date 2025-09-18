import express from 'express';
import investorRouter from './src/routes/invester_route';
import accountRouter from './src/routes/account_route';
import transactionRouter from './src/routes/transaction_route';
console.log('App is starting...');
const app = express();
app.use(express.json());
app.use('/investor', investorRouter);
app.use('/account', accountRouter);
app.use('/transaction', transactionRouter);

app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running on http://localhost:3000');
});

export default app;
