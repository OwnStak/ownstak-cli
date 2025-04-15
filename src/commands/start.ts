import { existsSync } from 'fs';
import { ASSETS_DIR_PATH, ASSETS_PORT, COMPUTE_DIR_PATH, PERSISTENT_ASSETS_DIR_PATH, PERSISTENT_ASSETS_PORT, PORT } from '../constants.js';
import { resolve } from 'path';
import { normalizePath } from '../utils/pathUtils.js';
import { logger } from '../logger.js';
import { readFile, stat, access } from 'fs/promises';
import http, { createServer, IncomingMessage, ServerResponse } from 'http';
import mime from 'mime-types';
import { createReadStream } from 'fs';
import { join } from 'path';
import { fork } from 'child_process';

export async function start() {
    process.env.LOCAL = 'true';

    const computeServerPath = resolve(COMPUTE_DIR_PATH, 'server.cjs');
    if (!existsSync(computeServerPath)) {
        logger.error(`The project was not built. Please run 'npx ownstak build' first.`);
        process.exit(1);
    }
    await startComputeServer(computeServerPath);

    const assetsDirPath = resolve(ASSETS_DIR_PATH);
    await startAssetsServer(assetsDirPath, ASSETS_PORT);

    const persistentAssetsDirPath = resolve(PERSISTENT_ASSETS_DIR_PATH);
    await startAssetsServer(persistentAssetsDirPath, PERSISTENT_ASSETS_PORT);
}

export async function startAssetsServer(assetsDirPath: string, port: number) {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
            const requestedPath = (req.url ? decodeURIComponent(req.url) : '/').replace(/\/+/g, '/');
            let filePath = resolve(join(assetsDirPath, requestedPath));
            logger.debug(`[Assets Server]: ${requestedPath} => ${filePath}`);

            // Check if the path is a directory
            const fileStat = await stat(filePath);
            if (fileStat.isDirectory()) {
                filePath = join(filePath, 'index.html');
            }

            // Check if the file exists
            await access(filePath);

            // Stream the file
            const mimeType = mime.lookup(filePath) || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mimeType });
            const readStream = createReadStream(filePath);
            readStream.pipe(res);
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        }
    });

    return new Promise((resolve, reject) => {
        server.listen(port, () => resolve(server));
        server.on('error', (error) => reject(error));
    });
}

export async function startComputeServer(computeServerPath: string) {
    const computeServer = fork(computeServerPath, {
        cwd: COMPUTE_DIR_PATH,
    });
    computeServer.on('message', (message: string) => {
        logger.debug(`[Compute Server]: ${message}`);
    });
    computeServer.on('error', (e: any) => {
        logger.error(`[Compute Server]: ${e}`);
    });
}
