import { ComputeError, ComputeErrorOptions } from './computeError.js';

export class ComputeReqRecursionError extends ComputeError {
    constructor(message: string, options: ComputeErrorOptions = {}) {
        super(message, {
            title: 'Request Recursion Error',
            statusCode: 542,
            ...options,
        });
    }
}
