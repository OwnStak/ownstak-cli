import chalk from 'chalk';
import { BRAND, VERSION } from './constants.js';
/**
 * Log levels in increasing order of severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

/**
 * Maps string log level to LogLevel enum
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    none: LogLevel.NONE,
};

class Logger {
    get level(): LogLevel {
        const envLevel = process.env.LOG_LEVEL?.toLowerCase();
        return envLevel && envLevel in LOG_LEVEL_MAP ? LOG_LEVEL_MAP[envLevel] : LogLevel.INFO;
    }

    private logInternal(logLevel: LogLevel, message: string, ...args: any[]): void {
        const logMessage = message
            .split('\n')
            .map((line) => {
                if (logLevel === LogLevel.ERROR) {
                    return chalk.redBright(`[ERROR] ${line}`);
                }
                if (logLevel === LogLevel.WARN) {
                    return chalk.yellowBright(`[WARN] ${line}`);
                }
                if (logLevel === LogLevel.DEBUG) {
                    return chalk.gray(`[DEBUG] ${line}`);
                }
                if (logLevel === LogLevel.INFO) {
                    return chalk.greenBright(`[INFO] `) + line;
                }
                return line;
            })
            .join('\n');

        const logFunction = {
            [LogLevel.ERROR]: console.error,
            [LogLevel.WARN]: console.warn,
            [LogLevel.DEBUG]: console.log,
            [LogLevel.INFO]: console.log,
            [LogLevel.NONE]: console.log,
        }[logLevel];

        logFunction?.(logMessage, ...args);
    }

    /**
     * Debug level logging (lowest level)
     */
    public debug(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.DEBUG) {
            this.logInternal(LogLevel.DEBUG, message, ...args);
        }
    }

    /**
     * Info level logging
     */
    public info(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.INFO) {
            this.logInternal(LogLevel.INFO, message, ...args);
        }
    }

    /**
     * Warning level logging
     */
    public warn(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.WARN) {
            this.logInternal(LogLevel.WARN, message, ...args);
        }
    }

    /**
     * Error level logging (highest level)
     */
    public error(message: string, ...args: any[]): void {
        if (this.level <= LogLevel.ERROR) {
            this.logInternal(LogLevel.ERROR, message, ...args);
        }
    }

    /**
     * Log to stdout without any prefix
     */
    public log(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.NONE, message, ...args);
    }

    /**
     * Draws "nice-looking" title to the console
     */
    public drawTitle(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.NONE, chalk.bgBlue.bold.whiteBright(` ${BRAND} CLI `) + chalk.white.bgBlackBright(` v${VERSION} `), message, ...args);
    }

    /**
     * Draws a table to the console
     * @example
     *  ╭─ title ─────────────────────╮
     *  │ Runtime: nodejs20.x         │
     *  ╰─────────────────────────────╯
     */
    public drawTable(lines: string[], options: DrawTableOptions = {}): void {
        if (lines.length === 0) return;

        // Find the longest line length
        const logLevel = options.logLevel ?? LogLevel.INFO;
        const maxLength = Math.max(...lines.map((line) => line.length));
        const padding = options.padding ?? 1; // Padding on each side
        const totalWidth = maxLength + padding * 2;

        // Create the top border with title if provided
        let topBorder: string;
        if (options.title) {
            const title = ` ${options.title} `;
            const remainingWidth = totalWidth - title.length;
            const leftBorder = '─'.repeat(Math.floor(remainingWidth / 2));
            const rightBorder = '─'.repeat(Math.ceil(remainingWidth / 2));
            topBorder = `╭${leftBorder}${title}${rightBorder}╮`;
        } else {
            const border = '─'.repeat(totalWidth);
            topBorder = `╭${border}╮`;
        }

        // Create the bottom border
        const bottomBorder = `╰${'─'.repeat(totalWidth)}╯`;

        // Create the content lines with padding
        const contentLines = lines.map((line) => {
            const paddedLine = line.padEnd(maxLength);
            return `│${' '.repeat(padding)}${paddedLine}${' '.repeat(padding)}│`;
        });

        // Combine all parts
        const table = [topBorder, ...contentLines, bottomBorder].join('\n');

        // Apply border color if specified
        const coloredTable = options.borderColor ? chalk[options.borderColor](table) : table;
        this.logInternal(logLevel, coloredTable);
    }
}

export interface DrawTableOptions {
    title?: string;
    borderColor?: 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
    padding?: number;
    logLevel?: LogLevel;
}

// Export a default instance for convenience
export const logger = new Logger();
