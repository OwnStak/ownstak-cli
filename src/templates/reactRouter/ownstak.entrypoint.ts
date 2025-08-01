// @ts-nocheck
import { resolve } from 'path';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { createRequestListener as createNodeRequestHandler } from '@react-router/node';

/**
 * This file is main entrypoint for React Router framework that starts HTTP server.
 * The react-router build output exports handler function that accepts Node.js HTTP request and response objects.
 * We just need to create a plain Node.js HTTP server and pass the handler to it.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const serverBuildMod = await import(resolve(__dirname, 'index.js'));
const serverBuild = serverBuildMod.default?.default || serverBuildMod.default || serverBuildMod;
if (!serverBuild) {
    throw new Error('The React Router build was not found.');
}

const nodeRequestHandler = createNodeRequestHandler({
    build: serverBuild,
    mode: process.env.NODE_ENV,
});

const server = createServer(nodeRequestHandler);
server.listen(PORT, HOST, () => {
    console.debug(`React Router server is running on http://${HOST}:${PORT}`);
});
server.on('error', (error) => {
    throw new Error(`Failed to start the React Router server: ${error}`);
});
