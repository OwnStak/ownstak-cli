import { Event } from '../router/proxyRequestEvent.js';
import { Config } from '../../config.js';
import { logger } from '../../logger.js';
import { detectRequestRecursions } from '../router/requestRecursions.js';
import { Request } from '../router/request.js';
import { Response } from '../router/response.js';
import { RequestContext } from '../router/requestContex.js';
import { HEADERS } from '../../constants.js';
import { ProxyResponseEvent } from '../router/proxyResponseEvent.js';

interface Context {
    callbackWaitsForEmptyEventLoop: boolean;
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: number;
}

interface ResponseStream {
    write: (chunk: string | Buffer | null | undefined | ProxyResponseEvent) => void;
    end: () => void;
}

declare global {
    namespace awslambda {
        function streamifyResponse(handler: any, options?: any): any;
    }
}

// 8 null bytes indicates the end of response headers part and start of the body in streaming mode.
// This special marker cannot appear anywhere in the res headers.
// e.g: "\x00\x00\x00\x00\x00\x00\x00\x00"
// IMPORTANT: This needs to be in sync with ownstak-proxy. DO NOT change unless you know what you are doing.
// See ownstak-proxy/src/middlewares/awsLambda.go
const STREAMING_BODY_DELIMITER = '\x00'.repeat(8);

let configPromise: Promise<Config> | undefined;
let appPromise: Promise<void> | undefined;

export const handler = awslambda.streamifyResponse(async (event: Event, responseStream: ResponseStream, context: Context) => {
    let config: Config | undefined;
    let request: Request | undefined;
    let response: Response | undefined;
    let ctx = new RequestContext();

    try {
        context.callbackWaitsForEmptyEventLoop = false;

        request = Request.fromEvent(event);
        logger.debug(`[Serverless][Request]: ${request.method} ${request.url}`);
        detectRequestRecursions(request);

        // Detect if the req comes from the proxy with streaming support
        if (request.getHeader(HEADERS.XOwnStreaming) === 'true') {
            // New streaming response format for ownstak-proxy 0.1.13+
            // e.g:
            // {"statusCode":200,"headers":{"content-type":"text/html; charset=utf-8"}}\x00\x00\x00\x00\x00\x00\x00\x00<html>...</html>
            response = new Response('', {
                onWriteHead: () => {
                    responseStream.write(JSON.stringify(response?.toEvent(false)));
                    responseStream.write(STREAMING_BODY_DELIMITER);
                },
                onWrite: (chunk) => responseStream.write(chunk),
                onEnd: () => responseStream.end(),
            });
        } else {
            // Old response format for ownstak-proxy 0.1.12 and below
            // NOTE: This small code for compatibility is here just so we have option to quickly rollback to older proxy version
            // if we discover some issues with streaming without forcing the users to do redeployment with the older CLI version.
            // TODO: Remove when it's no longer needed.
            // e.g:
            // {"statusCode":200,"headers":{"content-type":"text/html; charset=utf-8"},"body":"<html>...</html>"}
            response = new Response('', {
                onEnd: () => {
                    responseStream.write(JSON.stringify(response?.toEvent(true)));
                    responseStream.end();
                },
            });
        }

        configPromise ??= Config.loadFromBuild();
        config = await configPromise;

        // Create request context after req/res are initialized,
        ctx = new RequestContext({ request, response, config });

        // App is place that most likely will throw an error,
        // that's why we need to start it here after req/res are initialized,
        // so we can use req details such as requestId, accept header in the error response.
        appPromise ??= config.startApp();
        await appPromise;

        // Execute the router
        await config.router.execute(ctx);

        logger.debug(`[Serverless][Response]: ${response.statusCode}`);
        return ctx.response.end();
    } catch (e: any) {
        responseStream.write(JSON.stringify(ctx.handleError(e).toEvent()));
        responseStream.end();
    }
});
