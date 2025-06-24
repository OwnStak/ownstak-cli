import { CliError, CliErrorOptions } from '../cliError.js';
import { NAME } from '../constants.js';

export interface ConsoleErrorResult {
    error: string;
    code: string;
}

export class BaseConsoleError extends CliError {
    public response;

    constructor(result: ConsoleErrorResult, response: Response, cliErrorOptions: CliErrorOptions = {}) {
        super(`[${response.status}] ${result.error} (${result.code})`, cliErrorOptions);
        this.response = response;
    }
}

export class ConsoleUnauthenticatedError extends BaseConsoleError {}
export class ConsoleUnauthorizedError extends BaseConsoleError {}
export class ConsoleResourceNotFoundError extends BaseConsoleError {}
export class ConsoleValidationError extends BaseConsoleError {}
