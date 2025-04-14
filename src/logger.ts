/**
 * Log levels in increasing order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Maps string log level to LogLevel enum
 */
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'debug': LogLevel.DEBUG,
  'info': LogLevel.INFO,
  'warn': LogLevel.WARN,
  'error': LogLevel.ERROR,
};

/**
 * ANSI color codes
 */
const colors = {
  reset: '\x1b[0m',
  // Regular colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

export interface LoggerOptions {
  level?: LogLevel;
  useColors?: boolean;
  captureLogs?: boolean;
}

class Logger {
  private useColors: boolean;
  private captureLogs: boolean;
  private logs: string[] = [];

  constructor(options: LoggerOptions = {}) {
    this.useColors = options.useColors ?? this.shouldUseColors();
    this.captureLogs = options.captureLogs ?? false;
  }

  get level(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    return envLevel && envLevel in LOG_LEVEL_MAP
      ? LOG_LEVEL_MAP[envLevel]
      : LogLevel.INFO;
  }

  /**
   * Determine if colors should be enabled
   */
  private shouldUseColors(): boolean {
    // Check for NO_COLOR environment variable (https://no-color.org/)
    if (process.env.NO_COLOR !== undefined) {
      return false;
    }

    // Check if FORCE_COLOR is set
    if (process.env.FORCE_COLOR !== undefined) {
      return process.env.FORCE_COLOR !== '0';
    }

    // Check if we're in a CI environment
    if (process.env.CI !== undefined) {
      return true;
    }

    // Check if stdout is a TTY
    return process.stdout.isTTY;
  }

  /**
   * Enable or disable colors
   */
  public setUseColors(useColors: boolean): void {
    this.useColors = useColors;
  }

  /**
   * Apply color to text if colors are enabled
   */
  private colorize(text: string, color: keyof typeof colors): string {
    if (!this.useColors) return text;
    return colors[color] + text + colors.reset;
  }

  /**
   * Debug level logging (lowest level)
   */
  public debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const prefix = this.colorize('[DEBUG]', 'cyan');
      console.log(`${prefix} ${message}`, ...args);
      
    }
  }

  /**
   * Info level logging
   */
  public info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      const prefix = this.colorize('[INFO]', 'green');
      console.info(`${prefix} ${message}`, ...args);
    }
  }

  /**
   * Warning level logging
   */
  public warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      const prefix = this.colorize('[WARN]', 'yellow');
      console.warn(`${prefix} ${message}`, ...args);
    }
  }

  /**
   * Error level logging (highest level)
   */
  public error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      const prefix = this.colorize('[ERROR]', 'red');
      console.error(`${prefix} ${message}`, ...args);
    }
  }

  /**
   * Logs to console without any colorization or prefix
   */
  public log(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }
}

// Export a default instance for convenience
export const logger = new Logger({
  captureLogs: process.env.CAPTURE_LOGS === 'true',
});