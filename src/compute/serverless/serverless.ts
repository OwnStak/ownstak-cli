import { Event } from '../router/proxyRequestEvent.js';
import { Request } from '../router/request.js';
import { Config } from '../../config.js';
import { logger } from '../../logger.js';
import { HEADERS } from '../../constants.js';
import { detectRequestRecursions } from '../router/requestRecursions.js';
import { ComputeProjectError } from '../errors/index.js';

interface Context {
    callbackWaitsForEmptyEventLoop: boolean;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: number;
}

let configPromise: Promise<Config> | undefined;
let appPromise: Promise<void> | undefined;

export async function handler(event: Event, context: Context) {
    let request: Request | undefined;
    let config: Config | undefined;

    try {
        context.callbackWaitsForEmptyEventLoop = false;

        configPromise ??= Config.loadFromBuild();
        config = await configPromise;
        appPromise ??= config.startApp();
        await appPromise;

        request = Request.fromEvent(event);
        logger.debug(`[Serverless][Request]: ${request.method} ${request.url}`);

        detectRequestRecursions(request);
        const response = await config.router.execute(request);
        logger.debug(`[Serverless][Response]: ${response.statusCode}`);
        return response.toEvent();
    } catch (e: any) {
        // Wrap all non-ComputeError errors into ComputeError
        const computeError = ComputeProjectError.fromError(e);
        computeError.version = config?.cliVersion;
        computeError.requestId = request?.getHeader(HEADERS.XRequestId);
        const acceptContentType = request?.getHeader(HEADERS.Accept);
        console.error(computeError.toJSON(true));
        return computeError.toResponse(acceptContentType).toEvent();
    }
}
