import chalk from 'chalk';
import { BRAND, NAME } from './constants.js';
import { CliConfig } from './cliConfig.js';

const originalConsoleInfo = globalThis.console.info;
const originalConsoleDebug = globalThis.console.debug;
const originalConsoleLog = globalThis.console.log;
const originalConsoleWarn = globalThis.console.warn;
const originalConsoleError = globalThis.console.error;
const originalConsoleTrace = globalThis.console.trace;

const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

/**
 * Log levels in increasing order of severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
    SUCCESS = 5,
}

/**
 * Maps string log level to LogLevel enum
 */
const LOG_LEVELS_MAP: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    none: LogLevel.NONE,
    success: LogLevel.SUCCESS,
};

/**
 * Styles for different log levels
 */
const LOG_LEVEL_STYLES = {
    [LogLevel.DEBUG]: { symbol: '•', color: chalk.gray },
    [LogLevel.INFO]: { symbol: '•', color: chalk.blueBright },
    [LogLevel.WARN]: { symbol: '⚠', color: chalk.yellowBright },
    [LogLevel.ERROR]: { symbol: '✗', color: chalk.redBright },
    [LogLevel.NONE]: { symbol: '•', color: chalk.white },
    [LogLevel.SUCCESS]: { symbol: '✓', color: chalk.greenBright },
};
export type LogLevelStyle = (typeof LOG_LEVEL_STYLES)[keyof typeof LOG_LEVEL_STYLES];

/**
 * Formats for different log levels
 */
export const LOG_FORMATS = {
    text: 'text',
    json: 'json',
} as const;
export type LogFormat = (typeof LOG_FORMATS)[keyof typeof LOG_FORMATS];

export interface LogMetadata {
    [key: string]: any;
}

export interface DrawTableOptions {
    title?: string;
    borderColor?: 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'brand';
    padding?: number;
    logLevel?: LogLevel;
    minWidth?: number; // Minimum width for the table content area
    maxWidth?: number; // Maximum width for the table content area
}

export class Logger {
    private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private spinnerIndex = 0;
    private spinnerInterval: NodeJS.Timeout | null = null;
    private spinnerMessage: string | null = null;
    private metadata: LogMetadata = {};

    public stdoutBuffer = '';
    public stderrBuffer = '';

    // Load list of secret ENV variables that should be removed from the logs.
    // e.g.: process.env.OWNSTAK_SECRETS = 'API_KEY,SECRET_KEY,JWT_TOKEN' => [OWNSTAK_REDACTED_API_KEY]
    private secretKeys = process.env['OWNSTAK_SECRETS']?.split(',') || [];
    private secretValues = this.secretKeys.map((key) => process.env[key]);
    private secretValuePlaceholder = 'OWNSTAK_REDACTED';

    // Pattern to remove other sensitive values and keys, such as set-cookie, cookie, etc...
    // e.g. { cookie: 'session_id=1234567890' } => { cookie: '[OWNSTAK_REDACTED]' }
    private secretValuePattern = /(\b(?:\d[ -]*?){13,19}\b)/gi;
    private secretKeyPattern =
        /secret|token|access|authorization|api[_-]?key|session|auth|bearer|cookie|set[_-]?cookie|cvv|cvc|ssn|social[_-]?security|pin|pwd|passwd|password|credential|private[_-]?key|public[_-]?key|signature|nonce/i;

    constructor() {
        // Override original console methods and stdout/stderr
        // with our custom implementation that respects set log level from LOG_LEVEL env variable.
        // This ensures that even user's code will output only errors in production.
        // NOTE: process.stdout is treated as info level, process.stderr is treated as error level.
        this.overrideConsole();
        this.overrideStdStreams();
    }

    init(metadata: LogMetadata = {}): void {
        this.metadata = metadata;
    }

    get format(): LogFormat {
        const envFormat = process.env.LOG_FORMAT?.toLowerCase();
        return envFormat && envFormat in LOG_FORMATS ? LOG_FORMATS[envFormat as keyof typeof LOG_FORMATS] : LOG_FORMATS.text;
    }

    get level(): LogLevel {
        const envLevel = process.env.LOG_LEVEL?.toLowerCase();
        return envLevel && envLevel in LOG_LEVELS_MAP ? LOG_LEVELS_MAP[envLevel] : LogLevel.INFO;
    }

    /**
     * Debug level logging (lowest level)
     */
    public debug(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.DEBUG, message, metadata);
    }
    /**
     * Info level logging
     */
    public info(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.INFO, message, metadata);
    }

    /**
     * Warning level logging
     */
    public warn(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.WARN, message, metadata);
    }

    /**
     * Error level logging (highest level)
     */
    public error(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.ERROR, message, metadata);
    }

    /**
     * Success level logging for successful operations
     */
    public success(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.SUCCESS, message, metadata);
    }

    /**
     * Log to stdout with NONE log level that is always displayed
     * regardless of the configured log level.
     */
    public none(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.NONE, message, metadata);
    }

    /**
     * Log to stdout with INFO log level and no prefix.
     */
    public log(message: string, metadata: LogMetadata = {}): void {
        this.logInternal(LogLevel.INFO, message, metadata, false);
    }

    private logInternal(logLevel: LogLevel, messages: any | any[] = [], metadata: LogMetadata = {}, addPrefix = logLevel != LogLevel.NONE): void {
        // Do not log if log level is less than the current log level
        if (logLevel < this.level) return;

        // Stop spinner if it was active
        if (this.spinnerInterval) {
            this.stopSpinner();
        }

        // If there is any data in the buffers from the previous stdout/stderr writes,
        // flush the line first, so they don't corrupt the JSON logs
        // e.g.: write{ type: "ownstak.log", "message": "test message" } => write\r\n{ type: "ownstak.log", "message": "test message" }
        if (this.stdoutBuffer.length) process.stdout.write(`\r\n`);
        if (this.stderrBuffer.length) process.stderr.write(`\r\n`);

        // Format objects to nice human readable string representation
        // and correctly handle circular references in objects
        // e.g.: const obj = { key: 'value' }; obj.self = obj; console.log(obj) => { key: 'value', self: '[CIRCULAR]' }
        const stringify = (message: any) => {
            if (typeof message === 'string') return message;
            if (message instanceof Error) return message?.stack || message.toString();

            const seen = new WeakSet();
            return JSON.stringify(
                message,
                (_key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) return '[CIRCULAR]';
                        seen.add(value);
                    }
                    return value;
                },
                2,
            );
        };

        // Log provided messages as separate log entries
        (Array.isArray(messages) ? messages : [messages]).forEach((message) => {
            const humanReadableMessage = stringify(message);
            const formattedMessage = this.formatMessage(logLevel, humanReadableMessage, metadata, addPrefix);
            // Output the message to the appropriate stream in selected format
            const stdStream = logLevel === LogLevel.ERROR ? process.stderr : process.stdout;
            const stdStreamWrite = logLevel === LogLevel.ERROR ? originalStderrWrite : originalStdoutWrite;
            stdStreamWrite.call(stdStream, `${formattedMessage}\r\n`);
        });

        // Restart spinner if it was active
        if (this.spinnerMessage && logLevel >= this.level) {
            this.startSpinner(this.spinnerMessage);
        }
    }

    /**
     * Helper function to format time consistently: HH:MM:SS AM/PM
     * or ISO string if json format is enabled
     */
    private getTimeStamp(): string {
        const now = new Date();
        if (this.format === LOG_FORMATS.json) {
            return now.toISOString();
        }
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = (hours % 12 || 12).toString().padStart(2, '0'); // Convert to 12h format with leading zero
        return `${hour12}:${minutes}:${seconds} ${ampm}`;
    }

    private formatMessage(logLevel: LogLevel, message: string = '', metadata: LogMetadata = {}, addPrefix = logLevel != LogLevel.NONE): string {
        // If json format is enabled, return the messages as simple string
        if (this.format === LOG_FORMATS.json) {
            const level = logLevel <= LogLevel.NONE ? Object.keys(LOG_LEVELS_MAP)[logLevel].toUpperCase() : 'INFO';
            const timestamp = this.getTimeStamp();
            return JSON.stringify(
                this.hideSecrets({
                    type: `ownstak.log`,
                    ...this.metadata,
                    ...metadata,
                    message,
                    level,
                    timestamp,
                }),
            );
        }

        // Add message prefix to first line and padding to other lines
        // and return the result as a string message
        const { symbol, color } = LOG_LEVEL_STYLES[logLevel] || LOG_LEVEL_STYLES[LogLevel.NONE];
        // Normalize message lines to handle \r\n properly
        const messageLines = message.split('\n');
        const messagePrefix = addPrefix ? color(`${symbol} ${chalk.dim(this.getTimeStamp())}  `) : '';
        const messagePrefixPadding = messagePrefix ? ' '.repeat(15) : '';

        return messageLines
            .map((message, index) => {
                // Apply message prefix to first line if not empty
                if (message.length === 0) return message;
                return index === 0 ? `${messagePrefix}${message}` : `${messagePrefixPadding}${message}`;
            })
            .join('\n');
    }

    /**
     * Draws "nice-looking" title to the console
     */
    public drawTitle(label: string = ''): void {
        const title = ` ${BRAND} CLI `;
        const subtitle = ` v${CliConfig.getCurrentVersion()} `;
        this.log(`${chalk.bgBlueBright(' ')}${chalk.bgWhite.bold.blackBright(title)}${chalk.white.bgBlackBright(subtitle)} ${chalk.gray(label)}`);
        this.log('');
    }

    /**
     * Draws "nice-looking" subtitle to the console
     */
    public drawSubtitle(subtitle: string, label?: string): void {
        this.log(chalk.white.bgBlackBright(` ${subtitle} `) + (label ? ` ${chalk.gray(label)}` : ''));
    }

    /**
     * Display a loading spinner with a message
     */
    public startSpinner(message: string): void {
        if (this.spinnerInterval) {
            this.stopSpinner();
        }

        this.spinnerMessage = message;
        this.spinnerIndex = 0;

        if (process.stdout.isTTY) {
            const time = this.getTimeStamp();
            const timePrefix = chalk.dim(time) + '  ';

            this.spinnerInterval = setInterval(() => {
                const frame = this.spinnerFrames[this.spinnerIndex];
                process.stdout.write(`\r${chalk.blueBright(frame)} ${timePrefix}${this.spinnerMessage}`);
                this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
            }, 80);
        } else {
            // If not a TTY, just log the message once
            this.log(`${chalk.blueBright('⟳')} ${message}`);
        }
    }

    /**
     * Update the spinner message without stopping the spinner
     */
    public updateSpinner(message: string): void {
        if (this.spinnerInterval) this.spinnerMessage = message;
    }

    /**
     * Stop the spinner and clear the line
     */
    public stopSpinner(finalMessage?: string, logLevel: LogLevel = LogLevel.NONE): void {
        if (this.spinnerInterval) {
            // First clear the interval to stop the spinner
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;

            // Clear the current spinner line
            if (process.stdout.isTTY) {
                process.stdout.write('\r\x1b[K');
            }

            // If we have a final message, log it with the appropriate level
            if (finalMessage) {
                this.log(`${this.formatMessage(logLevel, finalMessage)}`);
            }

            this.spinnerMessage = null;
        }
    }

    /**
     * Show a styled command example
     */
    public command(command: string, description?: string): void {
        const formattedCommand = `${chalk.cyan(NAME)} ${chalk.bold(command)}`;
        if (description) {
            this.info(`${formattedCommand} - ${description}`);
        } else {
            this.info(formattedCommand);
        }
    }

    /**
     * Draws a table to the console with improved styling
     * @example
     *  ╭─ title ─────────────────────╮
     *  │ Runtime: nodejs20.x         │
     *  ╰─────────────────────────────╯
     */
    public drawTable(lines: string[], options: DrawTableOptions = {}): void {
        if (lines.length === 0) return;

        // Helper function to get visible length of string (without ANSI escape codes)
        const getVisibleLength = (str: string): number => {
            // Remove ANSI escape codes when calculating length
            return str.replace(/\u001b\[[0-9;]*m/g, '').length;
        };

        // Normalize all input lines - replace all types of line breaks with \n
        const normalizeLineBreaks = (input: string[]): string[] => {
            return input
                .map((line) =>
                    // Replace \r\n with \n, then replace any remaining \r with \n
                    line.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
                )
                .flatMap((line) =>
                    // Split by \n and create individual lines
                    line.split('\n'),
                );
        };

        // Normalize input lines to handle \r\n properly
        lines = normalizeLineBreaks(lines);

        // Helper function to wrap text to specified width
        const wrapText = (text: string, maxWidth: number): string[] => {
            if (getVisibleLength(text) <= maxWidth) {
                return [text];
            }

            const result: string[] = [];
            let line = '';
            let lineLength = 0;

            // Split by words but preserve ANSI codes
            const parts: { text: string; isAnsi: boolean }[] = [];

            // Extract ANSI codes and text parts
            const ansiRegex = /\u001b\[[0-9;]*m/g;
            let match;
            let lastIndex = 0;

            while ((match = ansiRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    // Add text before ANSI code
                    parts.push({ text: text.substring(lastIndex, match.index), isAnsi: false });
                }
                // Add ANSI code
                parts.push({ text: match[0], isAnsi: true });
                lastIndex = match.index + match[0].length;
            }

            // Add remaining text after last ANSI code
            if (lastIndex < text.length) {
                parts.push({ text: text.substring(lastIndex), isAnsi: false });
            }

            // If no ANSI codes were found, just split by words
            if (parts.length === 0) {
                parts.push({ text, isAnsi: false });
            }

            // Track ANSI state to properly apply to wrapped lines
            let currentAnsiState = '';

            for (const part of parts) {
                if (part.isAnsi) {
                    // Track ANSI state
                    currentAnsiState += part.text;
                    line += part.text;
                } else {
                    // Process regular text, word by word
                    const words = part.text.split(/(\s+)/);

                    for (const word of words) {
                        const wordLength = getVisibleLength(word);

                        if (lineLength + wordLength <= maxWidth) {
                            // If line length is ok, just add the word to the line
                            line += word;
                            lineLength += wordLength;
                            continue;
                        }

                        // If the line would be too long, try to wrap the words to new line
                        // without breaking the word first
                        if (word.length <= maxWidth) {
                            // Word length is ok, but line would be too long, wrap
                            result.push(line);
                            line = currentAnsiState + word;
                            lineLength = wordLength;
                            continue;
                        }

                        // Word itself is longer than max width, break the word to multiple lines until it fits
                        let remainingWord = word;
                        let remainingLineWidth = maxWidth - lineLength;

                        // First, add what fits on the current line
                        if (remainingLineWidth > 0) {
                            const firstChunk = remainingWord.slice(0, remainingLineWidth);
                            result.push(currentAnsiState + firstChunk);
                            remainingWord = remainingWord.slice(remainingLineWidth);
                        }

                        // Then break the remaining word into chunks that fit the max width
                        while (remainingWord.length > 0) {
                            const chunk = remainingWord.slice(0, maxWidth);
                            result.push(currentAnsiState + chunk);
                            remainingWord = remainingWord.slice(maxWidth);
                        }

                        // Reset line state since we've broken the word
                        line = '';
                        lineLength = 0;
                    }
                }
            }

            // Add final line if not empty
            if (line) {
                result.push(line);
            }

            return result;
        };

        const padding = options.padding ?? 1; // Padding on each side

        // Get terminal width and calculate maximum available content width
        const terminal_width = process.stdout.columns || 80;
        const linePrefix = 15; // Fixed padding for symbol + timestamp + spacing
        const maxAvailableWidth = terminal_width - padding * 2 - 2 - linePrefix; // -2 for borders, -linePrefix for log prefix

        // Apply maxWidth and limit minWidth to terminal width
        const maxContentWidth = options.maxWidth ? Math.min(options.maxWidth, maxAvailableWidth) : maxAvailableWidth;

        // Apply minimum width if specified, but don't exceed terminal width
        const minContentWidth = options.minWidth ? Math.min(options.minWidth, maxAvailableWidth) : 0;

        // Wrap lines and break them to fit within the available width
        let processedLines: string[] = [];
        for (const line of lines) {
            processedLines.push(...wrapText(line, maxContentWidth));
        }

        // Find the longest line length (accounting for ANSI color codes)
        const logLevel = options.logLevel ?? LogLevel.INFO;
        const contentMaxLength = Math.max(...processedLines.map((line) => getVisibleLength(line)));

        // Apply minimum width if specified
        const maxLength = Math.max(contentMaxLength, minContentWidth);
        const totalWidth = maxLength + padding * 2;

        // Create the top border with title if provided
        let topBorder: string;
        if (options.title) {
            const title = ` ${options.title} `;
            const titleLength = getVisibleLength(title);
            const remainingWidth = Math.max(0, totalWidth - titleLength);

            // Align title to the left with just a small padding
            const leftPadding = 2; // Small padding on the left
            const leftBorder = '─'.repeat(leftPadding);
            const rightBorder = '─'.repeat(Math.max(0, remainingWidth - leftPadding));
            topBorder = `╭${leftBorder}${chalk.bold(title)}${rightBorder}╮`;
        } else {
            const border = '─'.repeat(totalWidth);
            topBorder = `╭${border}╮`;
        }

        // Create the bottom border
        const bottomBorder = `╰${'─'.repeat(totalWidth)}╯`;

        // Create the content lines with padding
        const contentLines = processedLines.map((line) => {
            // Calculate visible length and padding needed
            const visibleLength = getVisibleLength(line);
            const paddingNeeded = maxLength - visibleLength;
            return `│${' '.repeat(padding)}${line}${' '.repeat(paddingNeeded + padding)}│`;
        });

        // Combine all parts
        const table = [topBorder, ...contentLines, bottomBorder].join('\n');

        // Apply border color if specified or use a default based on log level
        let coloredTable = table;

        // Default color mapping based on log level if no color is explicitly set
        const logLevelColorMap = {
            [LogLevel.DEBUG]: 'gray',
            [LogLevel.INFO]: 'blue',
            [LogLevel.WARN]: 'yellow',
            [LogLevel.ERROR]: 'red',
            [LogLevel.NONE]: 'white',
            [LogLevel.SUCCESS]: 'green',
        } as const;

        // Use explicitly defined color or fall back to log level based color
        const borderColor = options.borderColor ?? logLevelColorMap[logLevel];

        if (borderColor) {
            if (borderColor === 'brand') {
                // Use blue for brand color instead of gradient
                coloredTable = chalk.blueBright(table);
            } else if (borderColor in chalk) {
                coloredTable = chalk[borderColor](table);
            }
        }

        this.logInternal(logLevel, coloredTable);
    }

    /**
     * Override console methods to respect log levels
     */
    public overrideConsole(): void {
        // NOTE: Override just the methods, not whole globalThis.console object,
        // so libs can still use other methods and hold reference to this (e.g. console.dir)
        globalThis.console.trace = (...messages: any[]) => this.logInternal(LogLevel.DEBUG, messages, {}, false);
        globalThis.console.debug = (...messages: any[]) => this.logInternal(LogLevel.DEBUG, messages, {}, false);
        globalThis.console.log = (...messages: any[]) => this.logInternal(LogLevel.INFO, messages, {}, false);
        globalThis.console.info = (...messages: any[]) => this.logInternal(LogLevel.INFO, messages, {}, false);
        globalThis.console.warn = (...messages: any[]) => this.logInternal(LogLevel.WARN, messages, {}, false);
        globalThis.console.error = (...messages: any[]) => this.logInternal(LogLevel.ERROR, messages, {}, false);
    }

    /**
     * Restore console methods to original state
     */
    public restoreConsole(): void {
        globalThis.console.trace = originalConsoleTrace;
        globalThis.console.debug = originalConsoleDebug;
        globalThis.console.log = originalConsoleLog;
        globalThis.console.info = originalConsoleInfo;
        globalThis.console.warn = originalConsoleWarn;
        globalThis.console.error = originalConsoleError;
    }

    /**
     * Override stdout/stderr to respect log levels
     */
    public overrideStdStreams(): void {
        const logger = this;

        const writeToStdStream = function (level: LogLevel, chunk: any, encoding?: any, callback?: any) {
            // Do not log if log level is less than the current log level
            if (level < logger.level) return false;

            const stdStream = level === LogLevel.ERROR ? process.stderr : process.stdout;
            const stdStreamWrite = level === LogLevel.ERROR ? originalStderrWrite : originalStdoutWrite;

            // With LOG_LEVEL=text, output directly without any buffering or formatting,
            // so spinners etc... will work as expected locally.
            if (logger.format === LOG_FORMATS.text) {
                // Pass arguments only when provided
                if (typeof encoding === 'function') {
                    // If encoding is a function, it's actually the callback
                    return stdStreamWrite.call(stdStream, chunk, encoding);
                } else if (typeof callback === 'function') {
                    // Both encoding and callback are provided
                    return stdStreamWrite.call(stdStream, chunk, encoding, callback);
                } else {
                    // Only chunk is provided
                    return stdStreamWrite.call(stdStream, chunk);
                }
            }

            // With LOG_LEVEL=json, buffer the chunks until newline is encountered,
            // so every finished line creates a separate JSON log entry.
            level === LogLevel.ERROR ? (logger.stderrBuffer += chunk.toString()) : (logger.stdoutBuffer += chunk.toString());
            const stdStreamBuffer = level === LogLevel.ERROR ? logger.stderrBuffer : logger.stdoutBuffer;

            // Check if buffer contains newline - if so, flush
            if (stdStreamBuffer.includes('\n')) {
                const lines = stdStreamBuffer.split('\n');
                // Process all complete lines (except the last one if it doesn't end with newline)
                for (let i = 0; i < lines.length - 1; i++) {
                    if (!lines[i]) continue; // skip empty writes
                    const formattedLine = logger.formatMessage(level, lines[i].trim()); // format message for JSON logs
                    stdStreamWrite.call(stdStream, `${formattedLine}\r\n`);
                }
                // Keep the last line in buffer if it doesn't end with newline
                level === LogLevel.ERROR ? (logger.stderrBuffer = lines[lines.length - 1]) : (logger.stdoutBuffer = lines[lines.length - 1]);
            }

            // Call callback if provided
            if (typeof encoding === 'function') {
                encoding(); // if encoding is function, it's actually the callback
            } else if (typeof callback === 'function') {
                callback();
            }

            return true;
        };

        process.stdout.write = (chunk: any, encoding?: any, callback?: any): boolean => writeToStdStream(LogLevel.INFO, chunk, encoding, callback);
        process.stderr.write = (chunk: any, encoding?: any, callback?: any): boolean => writeToStdStream(LogLevel.ERROR, chunk, encoding, callback);
    }

    /**
     * Restore stdout/stderr to original state
     */
    public restoreStdStreams(): void {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
        this.stdoutBuffer = this.stderrBuffer = '';
    }

    hideSecrets(object: any): any {
        // No need to do anything for null/undefined/boolean
        if (object === null || object === undefined || typeof object === 'boolean') {
            return object;
        }

        // Remove ENV variables marked as secret from all the logs
        // e.g.: console.log(`My secret is ${process.env.API_KEY}`) => "My secret is [OWNSTAK_REDACTED_API_KEY]"
        // Remove potential sensitive patterns from all the strings
        // e.g.: console.log(`My credit card number is ${process.env.CREDIT_CARD_NUMBER}`) => "My credit card number is [OWNSTAK_REDACTED]"
        if (typeof object === 'string') {
            this.secretValues.forEach((value, index) => {
                const key = this.secretKeys[index];
                if (!key || !value) return;
                if (object.toString().includes(value)) {
                    object = object.toString().replaceAll(value, `[${this.secretValuePlaceholder}_${key.toUpperCase()}]`);
                }
            });
            return object.replace(this.secretValuePattern, `[${this.secretValuePlaceholder}]`);
        }

        // Call recursively on all the array items
        // e.g.: console.log(`My secret is:`, [process.env.SECRET, process.env.SECRET]) => "My secret is:\n[OWNSTAK_REDACTED, OWNSTAK_REDACTED]"
        if (Array.isArray(object)) {
            return object.map((item) => this.hideSecrets(item));
        }

        // Remove whole keys from objects that are considered sensitive
        // and run recursively on all values of the object
        // e.g.: console.log(`Req headers:`, { cookie: 'session_id=1234567890' }) => "Req headers:\n{ cookie: '[OWNSTAK_REDACTED]' }"
        if (typeof object === 'object') {
            const result: any = {};

            for (const [key, value] of Object.entries(object)) {
                const lowerKey = key.toLowerCase();
                if (this.secretKeyPattern.test(lowerKey)) {
                    result[key] = `[${this.secretValuePlaceholder}]`;
                } else {
                    result[key] = this.hideSecrets(value);
                }
            }

            return result;
        }

        // Return unchanged
        return object;
    }
}

// Export a default instance for convenience
export const logger = new Logger();
