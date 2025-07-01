import { Request } from '../router/request.js';
import { Config } from '../../config.js';
import { PORT, BRAND, HEADERS } from '../../constants.js';
import { logger, LogLevel } from '../../logger.js';
import { ComputeProjectError } from '../errors/index.js';
import http from 'http';
import chalk from 'chalk';

(async () => {
    const config = await Config.loadFromBuild();
    const appPromise = config.startApp();

    const server = http.createServer(async (nodeRequest, nodeResponse) => {
        let request: Request | undefined;

        try {
            await appPromise;
            request = await Request.fromNodeRequest(nodeRequest);
            logger.debug(`[Server][Request]: ${request.method} ${request.url}`);

            const response = await config.router.execute(request as Request);
            logger.debug(`[Server][Response]: ${response.statusCode}`);
            return response.toNodeResponse(nodeResponse);
        } catch (e: any) {
            // Wrap all non-ComputeError errors into ComputeError
            const computeError = ComputeProjectError.fromError(e);
            computeError.version = config?.cliVersion;
            computeError.requestId = request?.getHeader(HEADERS.XRequestId);
            const acceptContentType = request?.getHeader(HEADERS.Accept);
            console.error(computeError);
            return computeError.toResponse(acceptContentType).toNodeResponse(nodeResponse);
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
