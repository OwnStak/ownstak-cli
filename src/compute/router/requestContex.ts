import { Request } from './request.js';
import { Response } from './response.js';
import { Config } from '../../config.js';
import { ProjectError } from '../errors/projectError.js';
import { HEADERS } from '../../constants.js';
import { logger } from '../../logger.js';

export interface RequestContextOptions {
    request?: Request;
    response?: Response;
    config?: Config;
}

export class RequestContext {
    request: Request;
    response: Response;
    config: Config;

    constructor(options: RequestContextOptions = {}) {
        this.request = options.request ?? new Request();
        this.response = options.response ?? new Response();
        this.config = options.config ?? new Config();

        // Set output compression based on the request if it's not disabled in the config
        this.response.setOutputCompression(!!this.config.app.compression ? this.request.getHeader(HEADERS.AcceptEncoding) : undefined);
    }

    /**
     * Handles an error by converting it into ProjectError
     * response with details from req.
     */
    handleError(e: Error) {
        // Wrap all non-ProjectError errors into ProjectError
        const projectError = ProjectError.fromError(e);
        projectError.version = this.config.cliVersion;
        projectError.requestId = this.request.getHeader(HEADERS.XRequestId);
        const acceptContentType = this.request.getHeader(HEADERS.Accept);

        // Log the error
        logger.error(projectError.toJSON(true));
        return projectError.toResponse(acceptContentType);
    }
}
