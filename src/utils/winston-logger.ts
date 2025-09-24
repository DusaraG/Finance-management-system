import winston from 'winston';
import path from 'path';

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaString = '';
        if (Object.keys(meta).length > 0) {
            metaString = ` | ${JSON.stringify(meta, null, 0)}`;
        }
        return `${timestamp} [${level}]: ${message}${metaString}`;
    })
);

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'finance-management' },
    transports: [
        // Console transport for development
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
        }),
        
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logsDir, 'app.log'),
            format: fileFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        }),
        
        // Separate file for errors only
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            format: fileFormat,
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5
        })
    ],
    
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            format: fileFormat
        })
    ],
    
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            format: fileFormat
        })
    ]
});

// Enhanced Logger class with additional methods
class AdvancedLogger {
    // Standard logging methods
    static error(message: string, meta?: any) {
        logger.error(message, meta);
    }

    static warn(message: string, meta?: any) {
        logger.warn(message, meta);
    }

    static info(message: string, meta?: any) {
        logger.info(message, meta);
    }

    static debug(message: string, meta?: any) {
        logger.debug(message, meta);
    }

    // Specialized logging methods
    static transaction(operation: string, data: any) {
        this.info(`Transaction ${operation}`, {
            operation,
            transactionId: data.idempotencyKey || data._id,
            accountNumber: data.accountNumber,
            amount: data.amount,
            type: data.type,
            timestamp: new Date().toISOString()
        });
    }

    static database(operation: string, collection: string, meta?: any) {
        this.debug(`Database ${operation}`, {
            operation,
            collection,
            ...meta
        });
    }

    static api(method: string, endpoint: string, statusCode: number, duration: number, meta?: any) {
        const level = statusCode >= 400 ? 'warn' : 'info';
        logger.log(level, `API ${method} ${endpoint}`, {
            method,
            endpoint,
            statusCode,
            duration: `${duration}ms`,
            ...meta
        });
    }

    static cache(operation: string, key: string, hit?: boolean) {
        this.debug(`Cache ${operation}`, {
            operation,
            key,
            hit: hit !== undefined ? hit : undefined
        });
    }

    static redis(operation: string, success: boolean, meta?: any) {
        const level = success ? 'debug' : 'error';
        logger.log(level, `Redis ${operation}`, {
            operation,
            success,
            ...meta
        });
    }

    // Performance logging
    static performance(operation: string, duration: number, meta?: any) {
        this.debug(`Performance: ${operation}`, {
            operation,
            duration: `${duration}ms`,
            ...meta
        });
    }

    // Security logging
    static security(event: string, meta?: any) {
        this.warn(`Security: ${event}`, {
            event,
            timestamp: new Date().toISOString(),
            ...meta
        });
    }
}

export default AdvancedLogger;