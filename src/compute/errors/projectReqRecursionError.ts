import { ProjectError, ProjectErrorOptions } from './projectError.js';
import { STATUS_CODES } from '../../constants.js';

export class ProjectReqRecursionError extends ProjectError {
    constructor(message: string, options: ProjectErrorOptions = {}) {
        super(message, {
            title: 'Project Request Recursion Error',
            statusCode: STATUS_CODES.StatusProjectRequestRecursionError,
            ...options,
        });
    }
}
