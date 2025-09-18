import mongoose from 'mongoose';
import 'dotenv/config';
import app from './app';
import swaggerSetup from './swagger';
swaggerSetup(app);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/testdb';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((err: Error) => {
        console.error('Failed to connect to MongoDB:', err);
    });
