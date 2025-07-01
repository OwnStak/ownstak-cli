import { existsSync } from 'fs';
import { ASSETS_DIR_PATH, BRAND, BUILD_DIR_PATH, COMPUTE_DIR_PATH, NAME, PERMANENT_ASSETS_DIR_PATH, PORT, PROXY_DIR_PATH } from '../constants.js';
import { resolve } from 'path';
import { logger } from '../logger.js';
import { stat, access } from 'fs/promises';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import mime from 'mime-types';
import { createReadStream } from 'fs';
import { join } from 'path';
import { fork, spawn } from 'child_process';
import { getNearestFreePort } from '../utils/portUtils.js';
import { CliError } from '../cliError.js';

export async function start() {
    if (!existsSync(BUILD_DIR_PATH)) {
        throw new CliError(`The ${BRAND} project build does not exist. Please run \`npx ${NAME} build\` first.`);
    }

    logger.info(`Starting ${BRAND} project...`);

    // By default, we listen on 3000 port and all other apps 3001, 3002, etc...
    // If there's a port conflict, we'll try to find the nearest unused port and move to that one
    const freeMainPort = (await getNearestFreePort(PORT)) || PORT;
    const freeAppPort = (await getNearestFreePort(freeMainPort + 1)) || freeMainPort + 1;
    const freeAssetsPort = (await getNearestFreePort(freeMainPort + 2)) || freeMainPort + 2;
    const freepermanentAssetsPort = (await getNearestFreePort(freeMainPort + 3)) || freeMainPort + 3;

    // Set env vars before starting the compute server
    process.env.LOCAL = 'true';
    process.env.PORT = freeMainPort.toString();
    process.env.ASSETS_PORT = freeAssetsPort.toString();
    process.env.PERMANENT_ASSETS_PORT = freepermanentAssetsPort.toString();
    process.env.APP_PORT = freeAppPort.toString();
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // set INFO log level by default locally

    // Normalize the OS and architecture to match the proxy binary names
    const currentOs = process.platform.replace('win32', 'windows');
    const currentArch = process.arch.replace('aarch64', 'arm64').replace('x64', 'amd64');

    const assetsDirPath = resolve(ASSETS_DIR_PATH);
    await startAssetsServer(assetsDirPath, freeAssetsPort);

    const permanentAssetsDirPath = resolve(PERMANENT_ASSETS_DIR_PATH);
    await startAssetsServer(permanentAssetsDirPath, freepermanentAssetsPort);

    // Runs the actual ownstak-proxy server if present
    // This is useful for local development.
    const proxyServerPath = [
        resolve(PROXY_DIR_PATH, `ownstak-proxy-${currentOs}-${currentArch}`),
        resolve(PROXY_DIR_PATH, `ownstak-proxy-${currentOs}-${currentArch}.exe`),
        resolve(PROXY_DIR_PATH, `ownstak-proxy`),
        resolve(PROXY_DIR_PATH, `ownstak-proxy.exe`),
    ].find(existsSync);
    if (proxyServerPath) {
        logger.info(`Found ${BRAND} proxy server`);
        await startProxyServer(proxyServerPath, freeMainPort);
        return;
    }

    // If ownstak-proxy is not present, it runs the entrypoint of the compute server for Node.js
    const computeServerPath = [resolve(COMPUTE_DIR_PATH, 'server.cjs'), resolve(COMPUTE_DIR_PATH, 'server.mjs'), resolve(COMPUTE_DIR_PATH, 'server.js')].find(
        existsSync,
    );
    if (computeServerPath) {
        await startComputeServer(computeServerPath, freeMainPort);
        return;
    }

    throw new CliError(`Failed to start ${BRAND} project. Please try to run 'npx ${NAME} build' again.`);
}

/**
 * Starts the assets server that serves the assets from the assets directory
 * @param assetsDirPath - The path to the assets directory
 * @param port - The port to listen on
 * @returns The assets server
 */
export async function startAssetsServer(assetsDirPath: string, port: number) {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
            const requestedUrl = (req.url ? decodeURIComponent(req.url) : '/').replace(/\/+/g, '/');
            const requestedPath = requestedUrl.split('?').shift() || '/';
            let filePath = resolve(join(assetsDirPath, requestedPath));

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

/**
 * Starts the proxy server that proxies the requests to the compute server
 * @param proxyServerPath - The path to the proxy server
 * @param port - The port to listen on
 * @returns The proxy server
 */
export async function startProxyServer(proxyServerPath: string, port: number) {
    const proxyServer = spawn(proxyServerPath, {
        stdio: 'inherit',
        env: {
            ...process.env,
            PORT: port.toString(),
            HTTP_PORT: port.toString(),
            HTTPS_PORT: (port + 443).toString(),
            AWS_REGION: 'us-east-2',
            AWS_ACCESS_KEY_ID: 'xxx-xxx-xxx-xxx',
            AWS_SECRET_ACCESS_KEY: 'xxx-xxx-xxx-xxx',
        },
    });

    proxyServer.on('message', (message: string) => {
        logger.debug(`[Proxy Server]: ${message}`);
    });
    proxyServer.on('error', (e: any) => {
        logger.error(`[Proxy Server]: ${e}`);
    });

    return new Promise((resolve, reject) => {
        proxyServer.on('listening', () => resolve(proxyServer));
        proxyServer.on('error', (e: any) => reject(e));
    });
}

/**
 * Starts the compute server that serves the compute server
 * @param computeServerPath - The path to the compute server
 * @param port - The port to listen on
 * @returns The compute server
 */
export async function startComputeServer(computeServerPath: string, port: number) {
    const computeServer = fork(computeServerPath, {
        cwd: COMPUTE_DIR_PATH,
        env: {
            ...process.env,
            PORT: port.toString(),
        },
    });
    computeServer.on('message', (message: string) => {
        logger.debug(`[Compute Server]: ${message}`);
    });
    computeServer.on('error', (e: any) => {
        logger.error(`[Compute Server]: ${e}`);
    });
}
