import { ProjectError, ProjectErrorOptions } from './projectError.js';
import { STATUS_CODES } from '../../constants.js';

export class ProjectTimeoutError extends ProjectError {
    constructor(message: string, options: ProjectErrorOptions = {}) {
        super(message, {
            title: 'Project Timeout Error',
            statusCode: STATUS_CODES.StatusProjectTimeout,
            ...options,
        });
    }
}
