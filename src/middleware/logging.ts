import { Request, Response, NextFunction } from 'express';
import AdvancedLogger from '../utils/winston-logger';

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to request object for tracing
    (req as any).requestId = requestId;
    
    // Log incoming request
    AdvancedLogger.info('Incoming Request', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.method !== 'GET' ? req.body : undefined
    });

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(body: any) {
        const duration = Date.now() - start;
        
        AdvancedLogger.api(
            req.method, 
            req.url, 
            res.statusCode, 
            duration,
            {
                requestId,
                responseSize: JSON.stringify(body).length
            }
        );

        return originalJson.call(this, body);
    };

    next();
};

// Error logging middleware
export const errorLogger = (err: any, req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as any).requestId;
    
    AdvancedLogger.error('Unhandled Error', {
        requestId,
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack
        },
        method: req.method,
        url: req.url,
        body: req.body
    });

    res.status(500).json({ 
        error: 'Internal server error',
        requestId 
    });
};

// Performance monitoring middleware
export const performanceLogger = (threshold: number = 1000) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (duration > threshold) {
                AdvancedLogger.performance('Slow Request', duration, {
                    requestId: (req as any).requestId,
                    method: req.method,
                    url: req.url,
                    threshold: `${threshold}ms`
                });
            }
        });
        
        next();
    };
};