import { Request } from '../router/request.js';
import { Response } from '../router/response.js';
import { Config } from '../../config.js';
import { PORT, BRAND, HOST, NAME } from '../../constants.js';
import http from 'http';
import { logger, LogLevel } from '../../logger.js';
import chalk from 'chalk';

(async () => {
    const configPromise = Config.loadFromBuild();
    const config = await configPromise;
    await config.startApp();

    const server = http.createServer(async (nodeRequest, nodeResponse) => {
        try {
            const config = await configPromise;
            const request = await Request.fromNodeRequest(nodeRequest);
            logger.debug(`[Server][Request]: ${request.method} ${request.url}`);

            const response = await config.router.execute(request);
            logger.debug(`[Server][Response]: ${response.statusCode}`);
            return response.toNodeResponse(nodeResponse);
        } catch (e: any) {
            logger.error(e.stack);
            const response = new Response(
                JSON.stringify({
                    error: e.message,
                    stack: e.stack.split('\n').map((line: string) => line.trim()),
                }),
                {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            );
            return response.toNodeResponse(nodeResponse);
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
