import { ComputeError, ComputeErrorOptions } from './computeError.js';

export class ComputeProjectError extends ComputeError {
    constructor(message?: string, options: ComputeErrorOptions = {}) {
        super(message, {
            title: 'Project Error',
            statusCode: 534,
            ...options,
        });
    }
}
