import { HEADERS, INTERNAL_HEADERS_PREFIX, NAME } from '../../constants.js';
import { ProxyResponseEvent } from './proxyResponseEvent.js';
import http from 'http';
import zlib from 'zlib';
import { PassThrough } from 'stream';
import { logger, LogLevel } from '../../logger.js';

export const RESPONSE_COMPRESSIONS = {
    br: 'br',
    gzip: 'gzip',
    deflate: 'deflate',
} as const;
export type ResponseCompression = (typeof RESPONSE_COMPRESSIONS)[keyof typeof RESPONSE_COMPRESSIONS];

export const COMPRESSION_STREAM_CREATORS = {
    [RESPONSE_COMPRESSIONS.br]: () =>
        zlib.createBrotliCompress({
            params: {
                // Balance between compression and speed
                [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
            },
        }),
    [RESPONSE_COMPRESSIONS.gzip]: () => zlib.createGzip(),
    [RESPONSE_COMPRESSIONS.deflate]: () => zlib.createDeflate(),
} as const;

export type OutputStream = zlib.BrotliCompress | zlib.Gzip | zlib.Deflate | PassThrough;

export type OnWriteHeadCallback = (statusCode: number, headers: Record<string, string | string[]>) => void;
export type OnWriteCallback = (chunk: string | Buffer | null, encoding?: BufferEncoding) => void;
export type OnEndCallback = () => void;

export interface ResponseOptions {
    statusCode?: number;
    headers?: Record<string, string | string[]>;
    streaming?: boolean;
    outputCompression?: ResponseCompression;
    onWriteHead?: OnWriteHeadCallback;
    onWrite?: OnWriteCallback;
    onEnd?: OnEndCallback;
}

export class Response {
    statusCode: number;
    headers: Record<string, string | string[]> = {};
    chunks: Array<string | Buffer> = [];
    streaming: boolean;
    streamingStarted: boolean;
    ended: boolean = false;
    startTime: number = Date.now();

    outputCompression?: ResponseCompression = undefined;
    protected outputStream: OutputStream;

    protected onWriteHead?: OnWriteHeadCallback;
    protected onWrite?: OnWriteCallback;
    protected onEnd?: OnEndCallback;

    constructor(body: string | Buffer | undefined | null = undefined, options: ResponseOptions = {}) {
        this.statusCode = options.statusCode ?? 200;
        this.headers = options.headers ?? {};
        this.streaming = options.streaming ?? false;
        this.streamingStarted = false;
        this.chunks = body ? [body] : [];

        this.onWriteHead = options.onWriteHead;
        this.onWrite = options.onWrite;
        this.onEnd = options.onEnd;

        this.outputCompression = options.outputCompression;
        this.outputStream = this.createOutputStream(this.outputCompression);
    }

    setHeader(key: string, value: string | string[]) {
        this.headers[key.toLowerCase()] = value;
    }

    addHeader(key: string, value: string | string[]) {
        key = key.toLowerCase();
        const newValues = [...(this.getHeaderArray(key) || []), ...(Array.isArray(value) ? value : [value])];
        if (key == HEADERS.SetCookie.toLowerCase()) {
            // Set-Cookie header is the only case that can be duplicated and returned as an array
            this.headers[key] = newValues;
        } else {
            // For all other headers, merge the values into single string
            this.headers[key] = newValues.join(',');
        }
    }

    setHeaders(headers: Record<string, string | string[]>): void {
        for (const [key, value] of Object.entries(headers)) {
            this.setHeader(key, value);
        }
    }

    addHeaders(headers: Record<string, string | string[]>): void {
        for (const [key, value] of Object.entries(headers)) {
            this.addHeader(key, value);
        }
    }

    getHeader(key: string) {
        return this.headers[key.toLowerCase()]?.toString();
    }

    getHeaderArray(key: string) {
        return this.headers[key.toLowerCase()]?.toString()?.split(',') || [];
    }

    deleteHeader(key: string): void {
        delete this.headers[key.toLowerCase()];
    }

    enableStreaming(value = true): void {
        this.streaming = value;
    }

    writeHead(statusCode?: number, headers?: Record<string, string | string[]>): void {
        if (this.streamingStarted) return;
        this.streamingStarted = true;
        if (!this.onWriteHead) return;

        this.statusCode = statusCode ?? this.statusCode;
        for (const [key, value] of Object.entries(headers ?? {})) {
            this.setHeader(key, value);
        }

        // If the stored chunks cannot be effectively compressed
        // based on the content-type, do not apply any additional compression.
        this.outputCompression = this.isCompressable() ? this.outputCompression : undefined;
        // Initialize the output stream with the correct compression algorithm
        // right before writing the head when we know the content-type.
        this.outputStream = this.createOutputStream(this.outputCompression);

        // If output compression is set, set corresponding content-encoding header
        // and delete content-length header to prevent mismatch if we're streaming.
        // We don't know the final size without buffering the whole body.
        if (this.outputCompression) {
            this.setHeader(HEADERS.ContentEncoding, this.outputCompression);
            // Delete content-length if any compression is applied
            this.deleteHeader(HEADERS.ContentLength);
        }

        // If we're streaming and content-length is not known, set transfer-encoding to chunked.
        // The response cannot contain both content-length and transfer-encoding. That would cause an error.
        if (this.streaming) {
            this.setHeader(HEADERS.TransferEncoding, 'chunked');
            this.deleteHeader(HEADERS.ContentLength);
        } else {
            this.deleteHeader(HEADERS.TransferEncoding);
        }

        this.onWriteHead?.(this.statusCode, this.headers);
    }

    write(chunk: string | Buffer, encoding?: BufferEncoding): void {
        // Unify format so we hold only Buffers
        chunk = Buffer.isBuffer(chunk) || chunk === null ? chunk : Buffer.from(chunk, encoding);

        // If not streaming, buffer the chunks for later
        // when streaming is enabled or response.end() is called
        // and hold the original uncompressed body in buffer for possible future reads/updates.
        if (!this.streaming || !this.onWrite) {
            this.chunks.push(chunk);
            return;
        }

        // Once the streaming is enabled,
        // write the head and stream previously buffered chunks and apply compression to them.
        if (!this.streamingStarted) this.writeHead();
        this.chunks.forEach((chunk) => this.outputStream.write(chunk));
        this.chunks = [];

        // Stream currently written chunk though the output stream
        // that applies compression to each individual written chunk
        // while maintaining the continuous compression stream.
        this.outputStream.write(chunk);
        // If given stream supports flushing, flush every individual chunk to the output stream
        // to achieve real-time streaming to the end-client even with block algorithms
        // such as brotli that buffers a few chunks before compressing them (16KiB by default).
        // This way is completely up to the user's app whatever it will prefer faster delivery
        // or better compression ratio with bigger chunks.
        if ('flush' in this.outputStream && typeof this.outputStream.flush === 'function') {
            this.outputStream.flush();
        }
    }

    async end(): Promise<void> {
        // Make sure end can be called only once
        if (this.ended) return;
        this.ended = true;
        this.writeHead();

        // Once response.end() is called,
        // we'll write all the previously buffered/remaining chunks
        // through to the output stream and wait for it to finish.
        return new Promise((resolve, reject) => {
            this.outputStream.on('end', () => resolve());
            this.outputStream.on('error', (e: any) => reject(e));

            // We need to always write at least one chunk to the output stream
            // even though it's empty buffer/string.
            this.outputStream.write(this.body);
            this.outputStream.end();
        });
    }

    clear() {
        this.statusCode = 200;
        this.clearHeaders(true);
        this.clearBody();
        this.streaming = false;
        this.streamingStarted = false;
        this.ended = false;
        this.outputStream = this.createOutputStream(this.outputCompression);
    }

    clearHeaders(preserveInternal = false) {
        this.headers = preserveInternal ? this.internalHeaders : {};
    }

    clearBody() {
        this.chunks = [];
    }

    get internalHeaders(): Record<string, string | string[]> {
        return Object.fromEntries(Object.entries(this.headers).filter(([key]) => key.startsWith(INTERNAL_HEADERS_PREFIX)));
    }

    get body(): string | Buffer {
        if (this.chunks.length === 0) return '';

        // If first chunk is Buffer, convert all chunks to Buffer and concatenate
        if (this.chunks[0] instanceof Buffer) {
            const bufferChunks = this.chunks.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk || '')));
            return Buffer.concat(bufferChunks);
        }

        // Otherwise join as strings
        return this.chunks.join('');
    }

    set body(value: string | Buffer) {
        this.clearBody();
        this.write(value);
    }

    get inputCompression(): ResponseCompression | undefined {
        // Detect input compression from content-encoding header
        return RESPONSE_COMPRESSIONS[this.getHeader(HEADERS.ContentEncoding) as keyof typeof RESPONSE_COMPRESSIONS] || undefined;
    }

    /**
     * Set the output compression to given value
     * or list of values from accept-encoding header.
     * @param acceptEncodingHeader - The accept-encoding header to parse.
     * @example setOutputCompression('br,gzip')
     */
    setOutputCompression(acceptEncodingHeader?: string | ResponseCompression) {
        if (!acceptEncodingHeader) return;
        if (this.streamingStarted || this.ended) {
            logger.warn('Response compression cannot be changed after streaming has started or response has ended');
            return;
        }

        // Select the supported compression algorithm from the accept header
        // in the same order as they are defined in RESPONSE_COMPRESSIONS.
        // E.g. We prefer br over gzip if client supports both for better compression ratio and more cache hits,
        // even though the client might have gzip as first in the list.
        // This happens when client device has power saving mode enabled because brotli is more CPU intensive.
        const acceptedAlgorithms = acceptEncodingHeader.split(',').map((algorithm) => algorithm.trim().toLowerCase());
        const supportedAlgorithms = Object.keys(RESPONSE_COMPRESSIONS);
        const supportedAlgorithm = supportedAlgorithms.find((algorithm) => acceptedAlgorithms.includes(algorithm.toLowerCase()));
        this.outputCompression = supportedAlgorithm ? RESPONSE_COMPRESSIONS[supportedAlgorithm as keyof typeof RESPONSE_COMPRESSIONS] : undefined;
    }

    toEvent(includeBody = true): ProxyResponseEvent {
        // For security reason, some headers cannot be returned as multi-value headers (array of values)
        // even when they have only one value. For example: content-disposition header.
        // That's why we need to strictly keep them separate.
        // e.g: headers are overriding each other when processed by the proxy, multi-value headers not.
        // Most of the time multi-value headers are only: set-cookie
        const headers: Record<string, string> = {};
        const multiValueHeaders: Record<string, string[]> = {};
        Object.entries(this.headers).forEach(([key, value]) => {
            Array.isArray(value) ? (multiValueHeaders[key] = value) : (headers[key] = value);
        });
        return {
            statusCode: this.statusCode,
            headers,
            multiValueHeaders,
            body: includeBody ? (Buffer.isBuffer(this.body) ? this.body.toString('base64') : Buffer.from(this.body.toString()).toString('base64')) : undefined,
            isBase64Encoded: includeBody || undefined,
        };
    }

    toNodeResponse(nodeResponse: http.ServerResponse): void {
        nodeResponse.writeHead(this.statusCode, this.headers);
        nodeResponse.end(this.body);
    }

    /**
     * Initializes new output stream for the response with given compression algorithm.
     * @param algorithm - The compression algorithm to use
     * @example initOutputStream('br')
     */
    protected createOutputStream(algorithm?: ResponseCompression) {
        const createCompressionStream = algorithm ? COMPRESSION_STREAM_CREATORS[algorithm] : () => new PassThrough();
        const outputStream = createCompressionStream();

        // Attach callbacks to the output stream
        outputStream.on('data', (chunk: Buffer) => this.onWrite?.(chunk));
        outputStream.on('end', () => this.onEnd?.());
        outputStream.on('error', (e: any) => {
            throw e;
        });
        return outputStream;
    }

    /**
     * Checks if the response is compressable based on the input compression and content-types.
     */
    isCompressable() {
        // If input is already compressed, do not compress it again
        if (this.inputCompression) return false;
        const contentType = this.getHeader(HEADERS.ContentType) || 'text/plain';

        // All text/* content-types are considered compressable
        if (contentType.match(/^text\//i)) return true;
        // All known text-like application/* content-types are compressable
        if (contentType.match(/^application\/(json|xml|javascript|ecmascript|xhtml\+xml|rss|atom|xmpp|soap|web)/i)) return true;
        // SVG images are compressable
        if (contentType.match(/^image\/svg\+xml/i)) return true;

        // Rest such as images, audio, video, etc. are not effectively compressable
        // as they're usually already compressed by some algorithm.
        return false;
    }

    /**
     * Logs the outgoing response with metadata
     */
    log() {
        logger.info(`[Response]: ${this.statusCode} ${this.getHeader(HEADERS.ContentType) || 'text/plain'}`, {
            type: `ownstak.response`,
            statusCode: this.statusCode,
            headers: logger.level == LogLevel.DEBUG ? this.headers : undefined,
            duration: Date.now() - this.startTime,
        });
        return this;
    }
}
