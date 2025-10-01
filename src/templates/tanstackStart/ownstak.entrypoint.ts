import { resolve } from 'path';
import { createServer } from 'http';
import type http from 'node:http';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * This file is main entrypoint for Tanstack Start framework
 * that starts HTTP server with Tanstack Start default.fetch handler from server.js file.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const nodeRequestHandler = await createNodeRequestHandler();
const nodeServer = createServer(nodeRequestHandler);
nodeServer.listen(PORT, HOST, () => {
    console.debug(`Tanstack Start server is running on http://${HOST}:${PORT}`);
});
nodeServer.on('error', (e: any) => {
    throw new Error(`Failed to start the Tanstack Start server: ${e}`);
});

/**
 * Creates plain Node.js HTTP server request handler
 */
export async function createNodeRequestHandler() {
    const serverMod = await import(resolve(__dirname, 'server.js'));
    const server = serverMod.default?.default || serverMod.default || serverMod;
    if (!server) {
        throw new Error('The Tanstack Start server default.fetch export was not found.');
    }

    const requestHandler: (request: Request) => Response | Promise<Response> = server.fetch;
    return async (nodeRequest: http.IncomingMessage, nodeResponse: http.ServerResponse) => {
        const request: Request = createRequest(nodeRequest, nodeResponse);
        const response: Response = await requestHandler(request);

        nodeResponse.statusCode = response.status;
        nodeResponse.statusMessage = response.statusText;

        response.headers.forEach((values, key) => {
            nodeResponse.appendHeader(key, values);
        });
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
    const url = new URL(nodeRequest.url || '', `http://${nodeRequest.headers.host || 'localhost'}`);

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
    for (const [key, values] of Object.entries(nodeHeaders)) {
        if (!values) continue;
        if (Array.isArray(values)) {
            for (const value of values) {
                headers.append(key, value);
            }
        } else {
            headers.set(key, values);
        }
    }
    return headers;
}

/**
 * Converts a Node.js Readable stream to Web API ReadableStream
 * @param readable - The Node.js Readable stream
 * @returns Web API ReadableStream
 */
function createReadableStreamFromReadable(readable: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            readable.on('data', (chunk) => {
                controller.enqueue(new Uint8Array(chunk));
            });

            readable.on('end', () => {
                controller.close();
            });

            readable.on('error', (error) => {
                controller.error(error);
            });
        },

        cancel() {
            (readable as any).destroy();
        },
    });
}

/**
 * Converts a Web API ReadableStream to Node.js Writable stream
 * @param readableStream - The Web API ReadableStream
 * @param writable - The Node.js Writable stream
 * @returns Promise that resolves when the stream is finished
 */
async function writeReadableStreamToWritable(readableStream: ReadableStream<Uint8Array>, writable: http.ServerResponse): Promise<void> {
    const reader = readableStream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                writable.end();
                break;
            }

            // Handle backpressure by checking if we can write
            if (!writable.write(value)) {
                // Wait for drain event if write returns false
                await new Promise((resolve) => {
                    writable.once('drain', resolve);
                });
            }
        }
    } catch (error) {
        // Clean up reader and end writable on error
        reader.releaseLock();
        writable.end();
        throw error;
    } finally {
        reader.releaseLock();
    }
}
