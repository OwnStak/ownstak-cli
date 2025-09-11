import { Request } from '../router/request.js';
import { Config } from '../../config.js';
import { PORT, BRAND, HEADERS } from '../../constants.js';
import { logger, LogLevel } from '../../logger.js';
import http from 'http';
import chalk from 'chalk';
import { Response } from '../router/response.js';
import { RequestContext } from '../router/requestContex.js';

(async () => {
    const config = await Config.loadFromBuild();
    const appPromise = config.startApp();

    const server = http.createServer(async (nodeRequest, nodeResponse) => {
        let request: Request | undefined;
        let response: Response | undefined;
        let ctx = new RequestContext();

        try {
            await appPromise;

            request = await Request.fromNodeRequest(nodeRequest);
            logger.debug(`[Server][Request]: ${request.method} ${request.url}`);

            response = new Response('', {
                onWriteHead: async (statusCode, headers) => nodeResponse.writeHead(statusCode, headers),
                onWrite: async (chunk) => nodeResponse.write(chunk),
                onEnd: async () => nodeResponse.end(),
            });

            ctx = new RequestContext({ request, response, config });
            await config.router.execute(ctx);

            logger.debug(`[Server][Response]: ${response.statusCode}`);
            return ctx.response.end();
        } catch (e: any) {
            return ctx.handleError(e).toNodeResponse(nodeResponse);
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
        }
        logger.info('');
    });
})();
