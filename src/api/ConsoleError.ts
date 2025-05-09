export interface ConsoleErrorResult {
    error: string;
    code: string;
}

export class BaseConsoleError extends Error {
    public response;

    constructor(result: ConsoleErrorResult, response: Response) {
        super(`[${response.status}] ${result.error} (${result.code})`);
        this.response = response;
    }
}

export class ConsoleUnauthenticatedError extends BaseConsoleError {}
export class ConsoleUnauthorizedError extends BaseConsoleError {}
export class ConsoleResourceNotFoundError extends BaseConsoleError {}
