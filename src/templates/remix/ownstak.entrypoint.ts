// @ts-nocheck
import { resolve } from 'path';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import type { http } from 'node:http';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { installGlobals, createRequestHandler } from '@remix-run/node';
import { createReadableStreamFromReadable, writeReadableStreamToWritable } from '@remix-run/node';

/**
 * This file is main entrypoint for Remix framework that starts HTTP server with Remix app.
 * Unlike newer @react-router/node, Remix does not exports handler for Node.js HTTP server.
 * The remix build output exports handler function that accepts browser compatible Request and Response objects
 * from the Fetch API. That's why we need so many helper functions here to convert Node.js HTTP server req/res to Fetch API req/res and back again.
 * This implementation is based on https://github.com/mcansh/remix-node-http-server
 */

installGlobals();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const serverBuildMod = await import(resolve(__dirname, 'index.js'));
const serverBuild = serverBuildMod.default?.default || serverBuildMod.default || serverBuildMod;
if (!serverBuild) {
    throw new Error('The Remix build was not found.');
}

const nodeRequestHandler = createNodeRequestHandler({
    build: serverBuild,
    mode: process.env.NODE_ENV,
});

const server = createServer(nodeRequestHandler);
server.listen(PORT, HOST, () => {
    console.debug(`Remix server is running on http://${HOST}:${PORT}`);
});
server.on('error', (e: any) => {
    throw new Error(`Failed to start the Remix server: ${e}`);
});

/**
 * Creates plain Node.js HTTP server request handler
 */
export function createNodeRequestHandler({ build, mode }: { build: any; mode?: string }) {
    const requestHandler = createRequestHandler(build, mode);

    return async (nodeRequest: http.IncomingMessage, nodeResponse: http.ServerResponse) => {
        const request: Request = createRequest(nodeRequest, nodeResponse);
        const response: Response = await requestHandler(request);

        nodeResponse.statusCode = response.status;
        nodeResponse.statusMessage = response.statusText;

        for (let [key, values] of response.headers.entries()) {
            nodeResponse.appendHeader(key, values);
        }
        if (response.body) {
            return writeReadableStreamToWritable(response.body, nodeResponse);
        }
        nodeResponse.end();
    };
}

/**
 * Creates Fetch API Request object from a Node.js HTTP incoming message
 * @param nodeRequest - The Node.js HTTP request object
 * @param nodeResponse - The Node.js HTTP response object
 */
export function createRequest(nodeRequest: http.IncomingMessage, nodeResponse: http.OutgoingMessage): Request {
    const url = new URL(nodeRequest.url, `http://${nodeRequest.headers.host || 'localhost'}`);

    // Abort action/loaders once we can no longer write a response
    const controller = new AbortController();
    nodeResponse.on('close', () => controller.abort());

    const init: RequestInit = {
        method: nodeRequest.method,
        headers: createHeaders(nodeRequest.headers),
        signal: controller.signal,
    };

    if (nodeRequest.method !== 'GET' && nodeRequest.method !== 'HEAD') {
        init.body = createReadableStreamFromReadable(nodeRequest);
        (init as { duplex: 'half' }).duplex = 'half';
    }

    return new Request(url.href, init);
}

/**
 * Creates Fetch API Headers object from a Node.js HTTP incoming message headers
 * @param nodeHeaders - The Node.js HTTP request headers object
 */
export function createHeaders(nodeHeaders: http.IncomingHttpHeaders): Headers {
    const headers = new Headers();
    for (let [key, values] of Object.entries(nodeHeaders)) {
        if (!values) continue;
        if (Array.isArray(values)) {
            for (let value of values) {
                headers.append(key, value);
            }
        } else {
            headers.set(key, values);
        }
    }
    return headers;
}
