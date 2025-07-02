import chalk from 'chalk';
import { BRAND, NAME } from './constants.js';
import { CliConfig } from './cliConfig.js';

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleTrace = console.trace;

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
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    none: LogLevel.NONE,
    success: LogLevel.SUCCESS,
};

// Symbols for different log levels
const SYMBOLS = {
    error: '✖',
    warn: '⚠',
    info: '•',
    debug: '•',
    success: '✓',
    line: '─',
};

class Logger {
    private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private spinnerIndex = 0;
    private spinnerInterval: NodeJS.Timeout | null = null;
    private spinnerMessage: string | null = null;

    constructor() {
        // Override original console methods and stdout/stderr
        // with our custom implementation that respects set log level from LOG_LEVEL env variable.
        // This ensures that even user's code will output only errors in production.
        // NOTE: process.stdout is treated as info level, process.stderr is treated as error level.
        this.overrideConsole();
        this.overrideStdStreams();
    }

    get level(): LogLevel {
        const envLevel = process.env.LOG_LEVEL?.toLowerCase();
        return envLevel && envLevel in LOG_LEVEL_MAP ? LOG_LEVEL_MAP[envLevel] : LogLevel.INFO;
    }

    /**
     * Helper function to format time consistently: HH:MM:SS AM/PM
     */
    private getFormattedTime(): string {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = (hours % 12 || 12).toString().padStart(2, '0'); // Convert to 12h format with leading zero
        return `${hour12}:${minutes}:${seconds} ${ampm}`;
    }

    /**
     * Get the appropriate symbol and color for a log level
     */
    private getLogLevelStyle(logLevel: LogLevel): { symbol: string; color: any } {
        switch (logLevel) {
            case LogLevel.ERROR:
                return { symbol: SYMBOLS.error, color: chalk.redBright };
            case LogLevel.WARN:
                return { symbol: SYMBOLS.warn, color: chalk.yellowBright };
            case LogLevel.DEBUG:
                return { symbol: SYMBOLS.debug, color: chalk.gray };
            case LogLevel.INFO:
                return { symbol: SYMBOLS.info, color: chalk.blueBright };
            case LogLevel.SUCCESS:
                return { symbol: SYMBOLS.success, color: chalk.greenBright };
            default:
                return { symbol: '', color: chalk.white };
        }
    }

    private getLogPrefix(logLevel: LogLevel): string {
        const time = this.getFormattedTime();
        const { symbol, color } = this.getLogLevelStyle(logLevel);

        const afterSpace = '  ';
        return color(`${symbol} ${chalk.dim(time)}${afterSpace}`);
    }

    private logInternal(logLevel: LogLevel, message: string, ...args: any[]): void {
        if (this.spinnerInterval && logLevel >= this.level) {
            this.stopSpinner();
        }

        const prefix = this.getLogPrefix(logLevel);

        // Use a fixed padding for multi-line messages - this ensures consistent alignment
        // regardless of ANSI escape characters in the prefix
        const paddingLength = 15; // Enough space for symbol + timestamp + spacing

        const logMessage = message
            .split('\n')
            .map((line, index) => {
                // Only add prefix to the first line
                const linePrefix = index === 0 ? prefix : ' '.repeat(paddingLength);

                // If line is empty, don't add prefix
                if (line.trim() === '') {
                    return '';
                }

                if (logLevel === LogLevel.ERROR) {
                    return `${linePrefix}${chalk.redBright(line)}`;
                }
                if (logLevel === LogLevel.WARN) {
                    return `${linePrefix}${chalk.yellow(line)}`;
                }
                if (logLevel === LogLevel.DEBUG) {
                    return `${linePrefix}${chalk.gray(line)}`;
                }
                if (logLevel === LogLevel.INFO) {
                    return `${linePrefix}${chalk.white(line)}`;
                }
                if (logLevel === LogLevel.SUCCESS) {
                    return `${linePrefix}${chalk.green(line)}`;
                }
                return line;
            })
            .join('\n');

        const logFunction = {
            [LogLevel.ERROR]: console.error,
            [LogLevel.WARN]: console.warn,
            [LogLevel.DEBUG]: console.debug,
            [LogLevel.INFO]: console.log,
            [LogLevel.NONE]: console.log,
            [LogLevel.SUCCESS]: console.log,
        }[logLevel];

        logFunction?.(logMessage, ...args);

        // Restart spinner if it was active
        if (this.spinnerMessage && logLevel >= this.level) {
            this.startSpinner(this.spinnerMessage);
        }
    }

    /**
     * Debug level logging (lowest level)
     */
    public debug(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.DEBUG, message, ...args);
    }

    /**
     * Info level logging
     */
    public info(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.INFO, message, ...args);
    }

    /**
     * Warning level logging
     */
    public warn(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.WARN, message, ...args);
    }

    /**
     * Error level logging (highest level)
     */
    public error(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.ERROR, message, ...args);
    }

    /**
     * Success level logging for successful operations
     */
    public success(message: string, ...args: any[]): void {
        this.logInternal(LogLevel.SUCCESS, message, ...args);
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
    public drawTitle(label: string = ''): void {
        const title = ` ${BRAND} CLI `;
        const subtitle = ` v${CliConfig.getCurrentVersion()} `;
        console.log(`${chalk.bgBlueBright(' ')}${chalk.bgWhite.bold.blackBright(title)}${chalk.white.bgBlackBright(subtitle)} ${chalk.gray(label)}`);
        console.log('');
    }

    /**
     * Draws "nice-looking" subtitle to the console
     */
    public drawSubtitle(subtitle: string, label?: string): void {
        console.log(chalk.white.bgBlackBright(` ${subtitle} `) + (label ? ` ${chalk.gray(label)}` : ''));
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
            const time = this.getFormattedTime();
            const timePrefix = chalk.dim(time) + '  ';

            this.spinnerInterval = setInterval(() => {
                const frame = this.spinnerFrames[this.spinnerIndex];
                process.stdout.write(`\r${chalk.blueBright(frame)} ${timePrefix}${message}`);
                this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
            }, 80);
        } else {
            // If not a TTY, just log the message once
            console.log(`${chalk.blueBright('⟳')} ${message}`);
        }
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
                console.log(`${this.getLogPrefix(logLevel)}${finalMessage}`);
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
            const remainingWidth = totalWidth - titleLength;

            // Align title to the left with just a small padding
            const leftPadding = 2; // Small padding on the left
            const leftBorder = '─'.repeat(leftPadding);
            const rightBorder = '─'.repeat(remainingWidth - leftPadding);
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
        // Override console.log -> info level
        globalThis.console.log = (...args: any[]) => {
            if (this.level <= LogLevel.INFO) {
                originalConsoleLog(...args);
            }
        };

        // Override console.info -> info level
        globalThis.console.info = (...args: any[]) => {
            if (this.level <= LogLevel.INFO) {
                originalConsoleInfo(...args);
            }
        };

        // Override console.warn -> warn level
        globalThis.console.warn = (...args: any[]) => {
            if (this.level <= LogLevel.WARN) {
                originalConsoleWarn(...args);
            }
        };

        // Override console.error -> error level
        globalThis.console.error = (...args: any[]) => {
            if (this.level <= LogLevel.ERROR) {
                originalConsoleError(...args);
            }
        };

        // Override console.debug -> debug level
        globalThis.console.debug = (...args: any[]) => {
            if (this.level <= LogLevel.DEBUG) {
                originalConsoleDebug(...args);
            }
        };

        // Override console.trace -> debug level
        globalThis.console.trace = (...args: any[]) => {
            if (this.level <= LogLevel.DEBUG) {
                originalConsoleTrace(...args);
            }
        };
    }

    /**
     * Override stdout/stderr to respect log levels
     */
    public overrideStdStreams(): void {
        const logger = this;

        // Override stdout.write - treat as info level
        process.stdout.write = function (chunk: any, encoding?: any, callback?: any): boolean {
            if (logger.level <= LogLevel.INFO) {
                return originalStdoutWrite.call(this, chunk, encoding, callback);
            }
            // If logging is disabled, still call callback if provided
            if (typeof encoding === 'function') {
                encoding(); // encoding is actually the callback
            } else if (typeof callback === 'function') {
                callback();
            }
            return true;
        };

        // Override stderr.write - treat as error level
        process.stderr.write = function (chunk: any, encoding?: any, callback?: any): boolean {
            if (logger.level <= LogLevel.ERROR) {
                return originalStderrWrite.call(this, chunk, encoding, callback);
            }
            // If logging is disabled, still call callback if provided
            if (typeof encoding === 'function') {
                encoding(); // encoding is actually the callback
            } else if (typeof callback === 'function') {
                callback();
            }
            return true;
        };
    }
}

export interface DrawTableOptions {
    title?: string;
    borderColor?: 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'brand';
    padding?: number;
    logLevel?: LogLevel;
    minWidth?: number; // Minimum width for the table content area
    maxWidth?: number; // Maximum width for the table content area
}

// Export a default instance for convenience
export const logger = new Logger();
