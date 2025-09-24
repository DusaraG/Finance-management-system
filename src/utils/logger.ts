// Simple logger utility
export enum LogLevel {
    ERROR = 'ERROR',
    WARN = 'WARN',
    INFO = 'INFO',
    DEBUG = 'DEBUG'
}

class Logger {
    private static formatMessage(level: LogLevel, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }

    static error(message: string, error?: any) {
        const errorDetails = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error;
        
        console.error(this.formatMessage(LogLevel.ERROR, message, errorDetails));
    }

    static warn(message: string, meta?: any) {
        console.warn(this.formatMessage(LogLevel.WARN, message, meta));
    }

    static info(message: string, meta?: any) {
        console.info(this.formatMessage(LogLevel.INFO, message, meta));
    }

    static debug(message: string, meta?: any) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.formatMessage(LogLevel.DEBUG, message, meta));
        }
    }

    // Request logging helper
    static request(method: string, url: string, statusCode?: number, duration?: number) {
        const meta = { method, url, statusCode, duration: duration ? `${duration}ms` : undefined };
        this.info('HTTP Request', meta);
    }
}

export default Logger;