import { Request } from '../router/request.js';
import { Config } from '../../config.js';
import { PORT, BRAND, HEADERS } from '../../constants.js';
import { logger, LogLevel } from '../../logger.js';
import http from 'http';
import chalk from 'chalk';
import { Response } from '../router/response.js';
import { RequestContext } from '../router/requestContex.js';
import { detectRequestRecursions } from '../router/requestRecursions.js';

(async () => {
    const config = await Config.loadFromBuild();
    const appPromise = config.startApp();

    const server = http.createServer(async (nodeRequest, nodeResponse) => {
        let request: Request | undefined;
        let response: Response | undefined;
        let ctx = new RequestContext();

        try {
            await appPromise;

            request = (await Request.fromNodeRequest(nodeRequest)).log();
            // Attach requestId to logger's global metadata.
            // Right now this is used only locally and not correct because the server handles multiple requests at same time compared to serverless.
            // TODO: Use asyncLocalStorage to track request execution context inside server + within upstream requests to localhost.
            logger.init({ requestId: request.getHeader(HEADERS.XRequestId) });
            // Detect request recursions on the serverless platform
            detectRequestRecursions(request);

            response = new Response('', {
                onWriteHead: async (statusCode, headers) => nodeResponse.writeHead(statusCode, headers),
                onWrite: async (chunk) => nodeResponse.write(chunk),
                onEnd: async () => nodeResponse.end(),
            });

            ctx = new RequestContext({ request, response, config });
            await config.router.execute(ctx);

            return ctx.response.log().end();
        } catch (e: any) {
            return ctx.handleError(e).log().toNodeResponse(nodeResponse);
        }
    });

    server.listen(PORT, () => {
        // Draw "fancy table" if we're running locally
        if (process.env.LOCAL) {
            logger.success(`${BRAND} project is ready`);
            logger.drawTable(
                [
                    `Host: ${chalk.cyan(`http://127.0.0.1:${PORT}`)}`,
                    `Mode: ${chalk.cyan(process.env.NODE_ENV)}`,
                    ``,
                    chalk.gray(`Add ${chalk.cyan(`--debug`)} flag to see all logs.`),
                    chalk.gray(`Press ${chalk.cyan('CTRL+C')} to stop the server.`),
                ],
                {
                    logLevel: LogLevel.SUCCESS,
                },
            );
            logger.info('');
        }
    });
})();
