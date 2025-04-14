import { Request } from '../router/request.js';
import { Response } from '../router/response.js';
import { Config } from '../../config.js';
import { OUTPUT_CONFIG_FILE, PORT, BRAND } from '../../constants.js';
import http from 'http';
import { logger } from '../../logger.js';

(async () => {
    const configPromise = Config.load();
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
        logger.info(`${BRAND} server is running on port ${PORT}`);
    });
})();
