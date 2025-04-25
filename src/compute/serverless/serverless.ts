import { Event } from '../router/proxyRequestEvent.js';
import { Request } from '../router/request.js';
import { Response } from '../router/response.js';
import { Router } from '../router/router.js';
import { Config } from '../../config.js';
import { OUTPUT_CONFIG_FILE } from '../../constants.js';
import { logger } from '../../logger.js';

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
    try {
        context.callbackWaitsForEmptyEventLoop = false;

        configPromise ??= Config.loadFromBuild();
        const config = await configPromise;
        appPromise ??= config.startApp();
        await appPromise;

        const request = Request.fromEvent(event);
        logger.debug(`[Serverless][Request]: ${request.method} ${request.url}`);

        const response = await config.router.execute(request);
        logger.debug(`[Serverless][Response]: ${response.statusCode}`);
        return response.toEvent();
    } catch (e: any) {
        logger.error(e.stack);
        const response = new Response(
            JSON.stringify({
                error: e.message,
                stack: e.stack.split('\n').map((line: string) => line.trim()),
                event,
            }),
            {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );
        return response.toEvent();
    }
}
