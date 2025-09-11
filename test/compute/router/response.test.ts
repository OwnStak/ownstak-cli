import { Response } from '../../../src/compute/router/response.js';
import { jest } from '@jest/globals';

// Mock ServerResponse for testing toNodeResponse
class MockServerResponse {
    statusCode: number = 200;
    headers: Record<string, string | string[]> = {};

    writeHead = jest.fn((statusCode: number, headers?: Record<string, string | string[]>) => {
        this.statusCode = statusCode;
        if (headers) {
            this.headers = headers;
        }
    });

    end = jest.fn((body?: string | Buffer) => {
        // Store the body for testing
        (this as any).body = body;
    });
}

describe('Response', () => {
    let response: Response;

    beforeEach(() => {
        response = new Response();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
        jest.spyOn(console, 'info').mockImplementation(() => {});
    });

    describe('initialization', () => {
        it('should initialize with default values', () => {
            expect(response.statusCode).toBe(200);
            expect(response.headers).toEqual({});
            expect(response.body).toBe('');
            expect(response.streaming).toBe(false);
            expect(response.streamingStarted).toBe(false);
            expect(response.ended).toBe(false);
        });

        it('should initialize with custom status code', () => {
            const response = new Response(undefined, { statusCode: 404 });
            expect(response.statusCode).toBe(404);
        });

        it('should initialize with custom headers', () => {
            const response = new Response(undefined, {
                headers: {
                    'content-type': 'application/json',
                    'x-custom': 'test-value',
                },
            });
            expect(response.headers).toEqual({
                'content-type': 'application/json',
                'x-custom': 'test-value',
            });
        });

        it('should initialize with body and options', () => {
            const body = JSON.stringify({ message: 'Hello' });
            const response = new Response(body, {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
            });
            expect(response.body).toBe(body);
            expect(response.statusCode).toBe(201);
            expect(response.headers['content-type']).toBe('application/json');
        });

        it('should initialize with Buffer body', () => {
            const body = Buffer.from('Hello World');
            const response = new Response(body);
            expect(Buffer.isBuffer(response.body)).toBe(true);
            expect(response.body.toString()).toBe(body.toString());
        });
    });

    describe('status codes', () => {
        const statusCodes = [
            { code: 200, description: 'OK' },
            { code: 201, description: 'Created' },
            { code: 204, description: 'No Content' },
            { code: 301, description: 'Moved Permanently' },
        ];

        statusCodes.forEach(({ code, description }) => {
            it(`should handle ${code} ${description} status code`, () => {
                response.statusCode = code;
                expect(response.statusCode).toBe(code);

                const event = response.toEvent();
                expect(event.statusCode).toBe(code);
            });
        });
    });

    describe('header methods', () => {
        it('should set and get headers', () => {
            response.setHeader('content-type', 'application/json');
            response.setHeader('x-custom-header', 'custom-value');

            expect(response.getHeader('content-type')).toBe('application/json');
            expect(response.getHeader('x-custom-header')).toBe('custom-value');
            expect(response.getHeader('Content-Type')).toBe('application/json'); // Case insensitive
        });

        it('should handle header case insensitivity', () => {
            response.setHeader('Content-Type', 'application/json');
            response.setHeader('X-CUSTOM-HEADER', 'test-value');

            expect(response.getHeader('content-type')).toBe('application/json');
            expect(response.getHeader('x-custom-header')).toBe('test-value');
            expect(response.getHeader('CONTENT-TYPE')).toBe('application/json');
            expect(response.getHeader('X-Custom-Header')).toBe('test-value');
        });

        it('should get header arrays', () => {
            response.headers['set-cookie'] = ['session=abc123', 'user=john'];
            response.setHeader('accept', 'application/json');

            expect(response.getHeaderArray('set-cookie')).toEqual(['session=abc123', 'user=john']);
            expect(response.getHeaderArray('accept')).toEqual(['application/json']);
            expect(response.getHeaderArray('non-existent')).toEqual([]);
        });

        it('should add headers to existing ones', () => {
            response.setHeader('set-cookie', 'session=abc123');
            response.addHeader('set-cookie', 'user=john');

            expect(response.getHeaderArray('set-cookie')).toEqual(['session=abc123', 'user=john']);
        });

        it('should handle set-cookie headers specially', () => {
            response.setHeader('set-cookie', 'session=abc123');
            response.addHeader('set-cookie', 'user=john');
            response.addHeader('set-cookie', 'theme=dark');

            const cookies = response.getHeaderArray('set-cookie');
            expect(cookies).toEqual(['session=abc123', 'user=john', 'theme=dark']);
            expect(Array.isArray(response.headers['set-cookie'])).toBe(true);
        });

        it('should merge non-cookie headers with comma', () => {
            response.setHeader('accept', 'application/json');
            response.addHeader('accept', 'text/html');
            response.addHeader('accept', 'application/xml');

            expect(response.getHeader('accept')).toBe('application/json,text/html,application/xml');
            expect(typeof response.headers['accept']).toBe('string');
        });

        it('should set multiple headers at once', () => {
            response.setHeaders({
                'content-type': 'application/json',
                'x-api-version': '1.0',
                'cache-control': 'no-cache',
            });

            expect(response.getHeader('content-type')).toBe('application/json');
            expect(response.getHeader('x-api-version')).toBe('1.0');
            expect(response.getHeader('cache-control')).toBe('no-cache');
        });

        it('should add multiple headers at once', () => {
            response.setHeader('accept', 'application/json');
            response.addHeaders({
                accept: 'text/html',
                'x-custom': 'value1',
            });

            expect(response.getHeader('accept')).toBe('application/json,text/html');
            expect(response.getHeader('x-custom')).toBe('value1');
        });

        it('should delete headers', () => {
            response.setHeader('x-to-delete', 'value');
            response.setHeader('x-to-keep', 'keep-value');

            expect(response.getHeader('x-to-delete')).toBe('value');

            response.deleteHeader('x-to-delete');

            expect(response.getHeader('x-to-delete')).toBeUndefined();
            expect(response.getHeader('x-to-keep')).toBe('keep-value');
        });

        it('should delete headers case insensitively', () => {
            response.setHeader('Content-Type', 'application/json');
            response.deleteHeader('content-type');

            expect(response.getHeader('content-type')).toBeUndefined();
        });
    });

    describe('body handling', () => {
        it('should set and get string body', () => {
            const stringBody = 'Hello, world!';
            response.body = stringBody;

            expect(response.body?.toString()).toBe(stringBody);
        });

        it('should set and get buffer body', () => {
            const bufferBody = Buffer.from('Buffer content');
            response.body = bufferBody;

            expect(Buffer.isBuffer(response.body)).toBe(true);
            expect(response.body.toString()).toBe(bufferBody.toString());
        });

        it('should handle binary data', () => {
            const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello" in bytes
            response.body = binaryData;
            response.setHeader('content-type', 'application/octet-stream');

            expect(Buffer.isBuffer(response.body)).toBe(true);
            expect(response.body.toString()).toBe('Hello');
        });
    });

    describe('toEvent method', () => {
        it('should convert response to proxy event format', () => {
            response.statusCode = 201;
            response.setHeader('content-type', 'application/json');
            response.setHeader('x-custom', 'test-value');
            response.body = JSON.stringify({ success: true });

            const event = response.toEvent();

            expect(event.statusCode).toBe(201);
            expect(event.headers).toEqual({
                'content-type': 'application/json',
                'x-custom': 'test-value',
            });
            expect(event.isBase64Encoded).toBe(true);

            // Decode base64 body to verify content
            const decodedBody = Buffer.from(event.body || '', 'base64').toString();
            expect(JSON.parse(decodedBody)).toEqual({ success: true });
        });

        it('should handle string body in toEvent', () => {
            response.body = 'Plain text response';
            response.setHeader('content-type', 'text/plain');

            const event = response.toEvent();

            expect(event.isBase64Encoded).toBe(true);
            const decodedBody = Buffer.from(event.body || '', 'base64').toString();
            expect(decodedBody.toString()).toBe('Plain text response');
        });

        it('should handle Buffer body in toEvent', () => {
            const bufferBody = Buffer.from('Buffer content');
            response.body = bufferBody;

            const event = response.toEvent();

            expect(event.isBase64Encoded).toBe(true);
            const decodedBody = Buffer.from(event.body || '', 'base64').toString();
            expect(decodedBody).toBe('Buffer content');
        });

        it('should handle empty body in toEvent', () => {
            response.statusCode = 204;

            const event = response.toEvent();

            expect(event.statusCode).toBe(204);
            expect(event.body).toBe(''); // Empty string encoded as base64
            expect(event.isBase64Encoded).toBe(true);
        });

        it('should handle array headers in toEvent', () => {
            response.setHeader('set-cookie', ['session=abc123', 'user=john']);
            response.addHeader('set-cookie', 'theme=dark');
            response.setHeader('accept', 'application/json');

            const event = response.toEvent();

            // Array headers should be converted to first value only
            expect(event.headers?.['set-cookie']).toBeUndefined();
            expect(event.multiValueHeaders?.['set-cookie']).toEqual(['session=abc123', 'user=john', 'theme=dark']);
            expect(event.headers?.['accept']).toBe('application/json');
        });

        it('should handle various status codes in toEvent', () => {
            const testCases = [
                { code: 200, body: 'OK' },
                { code: 404, body: 'Not Found' },
                { code: 500, body: 'Internal Server Error' },
                { code: 302, body: '' },
            ];

            testCases.forEach(({ code, body }) => {
                response.statusCode = code;
                response.body = body;

                const event = response.toEvent();

                expect(event.statusCode).toBe(code);
                const decodedBody = Buffer.from(event.body || '', 'base64').toString();
                expect(decodedBody).toBe(body);
            });
        });
    });

    describe('toNodeResponse method', () => {
        let mockResponse: MockServerResponse;

        beforeEach(() => {
            mockResponse = new MockServerResponse();
        });

        it('should convert response to Node.js response', () => {
            response.statusCode = 201;
            response.setHeader('content-type', 'application/json');
            response.setHeader('x-custom', 'test-value');
            response.body = JSON.stringify({ success: true });

            response.toNodeResponse(mockResponse as any);

            expect(mockResponse.writeHead).toHaveBeenCalledWith(201, {
                'content-type': 'application/json',
                'x-custom': 'test-value',
            });
            expect(mockResponse.end).toHaveBeenCalledWith(response.body);
        });

        it('should handle Buffer body in toNodeResponse', () => {
            const bufferBody = Buffer.from('Buffer content');
            response.body = bufferBody;
            response.setHeader('content-type', 'application/octet-stream');

            response.toNodeResponse(mockResponse as any);

            expect(mockResponse.end).toHaveBeenCalledWith(bufferBody);
        });

        it('should handle empty body in toNodeResponse', () => {
            response.statusCode = 204;

            response.toNodeResponse(mockResponse as any);

            expect(mockResponse.writeHead).toHaveBeenCalledWith(204, {});
            expect(mockResponse.end).toHaveBeenCalledWith('');
        });

        it('should handle array headers in toNodeResponse', () => {
            response.setHeader('set-cookie', ['session=abc123', 'user=john']);
            response.setHeader('accept', 'application/json');

            response.toNodeResponse(mockResponse as any);

            expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
                'set-cookie': ['session=abc123', 'user=john'],
                accept: 'application/json',
            });
        });

        it('should handle various status codes in toNodeResponse', () => {
            const testCases = [
                { code: 200, body: Buffer.from('OK') },
                { code: 404, body: Buffer.from('Not Found') },
                { code: 500, body: Buffer.from('Internal Server Error') },
                { code: 302, body: Buffer.from('') },
            ];

            testCases.forEach(({ code, body }) => {
                const mockResp = new MockServerResponse();
                response.statusCode = code;
                response.body = body;

                response.toNodeResponse(mockResp as any);

                expect(mockResp.writeHead).toHaveBeenCalledWith(code, {});
                expect(mockResp.end).toHaveBeenCalledWith(body);
            });
        });

        it('should not remove AWS headers in toNodeResponse', () => {
            response.setHeader('x-amz-request-id', 'test-request-id');
            response.setHeader('x-amzn-trace-id', 'test-trace-id');
            response.setHeader('content-type', 'application/json');

            response.toNodeResponse(mockResponse as any);

            // AWS headers should still be present for Node response
            expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
                'x-amz-request-id': 'test-request-id',
                'x-amzn-trace-id': 'test-trace-id',
                'content-type': 'application/json',
            });
        });
    });

    describe('clear method', () => {
        it('should reset the response to default state', () => {
            response.statusCode = 404;
            response.setHeader('content-type', 'text/html');
            response.body = 'Not found';

            response.clear();

            expect(response.statusCode).toBe(200);
            expect(response.headers).toEqual({});
            expect(response.body).toBe('');
            expect(response.streaming).toBe(false);
            expect(response.streamingStarted).toBe(false);
            expect(response.ended).toBe(false);
        });

        it('should clear complex response state', () => {
            response.statusCode = 500;
            response.setHeaders({
                'content-type': 'application/json',
                'x-api-version': '1.0',
                'set-cookie': ['session=abc', 'user=john'],
            });
            response.body = Buffer.from('Error message');

            response.clear();

            expect(response.statusCode).toBe(200);
            expect(Object.keys(response.headers)).toHaveLength(0);
            expect(response.body).toBe('');
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle undefined header values', () => {
            response.headers['test-header'] = undefined as any;

            expect(response.getHeader('test-header')).toBeUndefined();
            expect(response.getHeaderArray('test-header')).toEqual([]);
        });

        it('should handle null body gracefully', () => {
            response.body = null as any;

            const event = response.toEvent();
            expect(event.body).toBe(''); // null becomes empty string

            const mockResp = new MockServerResponse();
            response.toNodeResponse(mockResp as any);
            expect(mockResp.end).toHaveBeenCalledWith('');
        });

        it('should handle very large response bodies', () => {
            const largeBody = Buffer.from('x'.repeat(1000000)); // 1MB string
            response.body = largeBody;

            const event = response.toEvent();
            const decodedBody = Buffer.from(event.body || '', 'base64');
            expect(decodedBody.toString()).toBe(largeBody.toString());

            const mockResp = new MockServerResponse();
            response.toNodeResponse(mockResp as any);
            expect(mockResp.end).toHaveBeenCalledWith(largeBody);
        });

        it('should handle special characters in headers', () => {
            response.setHeader('x-special-chars', 'value with spaces, commas, and "quotes"');

            expect(response.getHeader('x-special-chars')).toBe('value with spaces, commas, and "quotes"');

            const event = response.toEvent();
            expect(event.headers?.['x-special-chars']).toBe('value with spaces, commas, and "quotes"');
        });
    });

    describe('toEvent with and without body', () => {
        beforeEach(() => {
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json');
            response.setHeader('x-custom', 'test');
            response.body = JSON.stringify({ message: 'test' });
        });

        it('should include body by default', () => {
            const event = response.toEvent();

            expect(event.body).toBeDefined();
            expect(event.isBase64Encoded).toBe(true);
            const decodedBody = Buffer.from(event.body || '', 'base64').toString();
            expect(JSON.parse(decodedBody)).toEqual({ message: 'test' });
        });

        it('should exclude body when includeBody is false', () => {
            const event = response.toEvent(false);

            expect(event.body).toBeUndefined();
            expect(event.isBase64Encoded).toBeUndefined();
            expect(event.statusCode).toBe(200);
            expect(event.headers).toEqual({
                'content-type': 'application/json',
                'x-custom': 'test',
            });
        });

        it('should handle multiValueHeaders correctly', () => {
            response.setHeader('set-cookie', ['session=abc', 'user=john']);
            response.setHeader('single-header', 'value');

            const event = response.toEvent();

            expect(event.headers).toEqual({
                'content-type': 'application/json',
                'x-custom': 'test',
                'single-header': 'value',
            });
            expect(event.multiValueHeaders).toEqual({
                'set-cookie': ['session=abc', 'user=john'],
            });
        });

        it('should handle empty body correctly', () => {
            response.body = '';

            const eventWithBody = response.toEvent(true);
            const eventWithoutBody = response.toEvent(false);

            expect(eventWithBody.body).toBe('');
            expect(eventWithBody.isBase64Encoded).toBe(true);
            expect(eventWithoutBody.body).toBeUndefined();
            expect(eventWithoutBody.isBase64Encoded).toBeUndefined();
        });
    });

    describe('streaming', () => {
        let writeHeadMock: jest.Mock;
        let writeMock: jest.Mock;
        let endMock: jest.Mock;

        beforeEach(() => {
            writeHeadMock = jest.fn();
            writeMock = jest.fn();
            endMock = jest.fn();

            response = new Response('', {
                onWriteHead: writeHeadMock,
                onWrite: writeMock,
                onEnd: endMock,
            });
        });

        it('should call onWriteHead when writeHead is called', () => {
            response.enableStreaming();
            response.writeHead(201, { 'content-type': 'application/json' });

            expect(writeHeadMock).toHaveBeenCalledWith(
                201,
                expect.objectContaining({
                    'content-type': 'application/json',
                    'transfer-encoding': 'chunked',
                }),
            );
        });

        it('should call onWriteHead on first chunk write', () => {
            response.enableStreaming();
            response.write('chunk1');
            expect(writeHeadMock).toHaveBeenCalledTimes(1);
        });

        it('should call onWrite when writing chunks in streaming mode', () => {
            response.enableStreaming();
            response.write('chunk1');
            response.write('chunk2');

            expect(writeMock).toHaveBeenCalledTimes(2);
            expect(writeMock).toHaveBeenNthCalledWith(1, Buffer.from('chunk1'));
            expect(writeMock).toHaveBeenNthCalledWith(2, Buffer.from('chunk2'));
        });

        it('should call onEnd when response ends', async () => {
            response.enableStreaming();
            response.write('test data');
            await response.end();

            expect(endMock).toHaveBeenCalledTimes(1);
        });

        it('should not call callbacks if streaming is disabled', () => {
            response.enableStreaming(false);
            response.write('chunk1');
            response.write('chunk2');

            expect(writeMock).not.toHaveBeenCalled();
        });

        it('should call onWriteHead only once', () => {
            response.enableStreaming();
            response.writeHead(200);
            response.writeHead(404); // Should be ignored

            expect(writeHeadMock).toHaveBeenCalledTimes(1);
            expect(writeHeadMock).toHaveBeenCalledWith(200, expect.any(Object));
        });

        it('should buffer chunks until streaming is enabled', () => {
            response.enableStreaming(false);
            response.write('chunk1');
            response.write('chunk2');
            expect(writeHeadMock).not.toHaveBeenCalled();
            expect(writeMock).not.toHaveBeenCalled();
            response.enableStreaming(true);
            response.write('chunk3');
            response.write('chunk4');

            expect(writeHeadMock).toHaveBeenCalledTimes(1);
            expect(writeMock).toHaveBeenCalledTimes(4);
            expect(writeMock).toHaveBeenNthCalledWith(1, Buffer.from('chunk1'));
            expect(writeMock).toHaveBeenNthCalledWith(2, Buffer.from('chunk2'));
            expect(writeMock).toHaveBeenNthCalledWith(3, Buffer.from('chunk3'));
            expect(writeMock).toHaveBeenNthCalledWith(4, Buffer.from('chunk4'));
        });

        it('should stream on body write', () => {
            response.enableStreaming();
            response.body = 'Hello World';
            expect(writeHeadMock).toHaveBeenCalledTimes(1);
            expect(writeMock).toHaveBeenCalledWith(Buffer.from('Hello World'));
        });

        it('should set transfer-encoding to chunked when streaming is enabled', () => {
            response.enableStreaming();
            response.writeHead();
            expect(response.getHeader('transfer-encoding')).toBe('chunked');
        });

        it('should delete content-length header when streaming is enabled', async () => {
            response.enableStreaming();
            response.setHeader('content-length', '100');
            response.writeHead();
            await response.end();

            expect(response.getHeader('content-length')).toBeUndefined();
        });
    });

    describe('buffering', () => {
        let writeHeadMock: jest.Mock;
        let writeMock: jest.Mock;
        let endMock: jest.Mock;

        beforeEach(() => {
            writeHeadMock = jest.fn();
            writeMock = jest.fn();
            endMock = jest.fn();

            response = new Response('', {
                streaming: true,
                onWriteHead: writeHeadMock,
                onWrite: writeMock,
                onEnd: endMock,
            });
        });

        it('should buffer all chunks with callbacks', () => {
            response.enableStreaming(false);
            response.write('chunk1');
            response.write('chunk2');
            expect(writeMock).not.toHaveBeenCalled();
            response.end();
            expect(writeMock).toHaveBeenCalledTimes(1);
            expect(writeMock).toHaveBeenNthCalledWith(1, Buffer.from('chunk1chunk2'));
        });

        it('should buffer all chunks without any callbacks', () => {
            response = new Response();

            response.enableStreaming(false);
            response.write('chunk1');
            response.write('chunk2');
            expect(response.body.toString()).toBe('chunk1chunk2');
            response.end();
            expect(response.body.toString()).toBe('chunk1chunk2');
        });

        it('should call onWriteHead() when response ends', () => {
            response.enableStreaming(false);
            response.statusCode = 404;
            response.setHeader('content-type', 'application/json');
            response.write('chunk1');
            response.write('chunk2');
            expect(writeHeadMock).not.toHaveBeenCalled();
            response.end();
            expect(writeHeadMock).toHaveBeenCalledTimes(1);
            expect(writeHeadMock).toHaveBeenCalledWith(
                404,
                expect.objectContaining({
                    'content-type': 'application/json',
                }),
            );
        });

        it('should call onEnd when response ends', async () => {
            response.enableStreaming(false);
            response.write('chunk1');
            expect(endMock).not.toHaveBeenCalled();
            await response.end();
            expect(endMock).toHaveBeenCalledTimes(1);
        });

        it('should not set transfer-encoding when streaming is disabled', () => {
            response.enableStreaming(false);
            response.writeHead();
            expect(response.getHeader('transfer-encoding')).toBeUndefined();
        });

        it('should preserve content-length header when both streaming and compression are disabled', async () => {
            response.enableStreaming(false);
            response.setOutputCompression();
            response.setHeader('content-length', '100');
            response.writeHead();
            await response.end();

            expect(response.getHeader('content-length')).toBe('100');
        });
    });

    describe('compression', () => {
        let writeHeadMock: jest.Mock;
        let writeMock: jest.Mock;
        let endMock: jest.Mock;

        beforeEach(() => {
            writeHeadMock = jest.fn();
            writeMock = jest.fn();
            endMock = jest.fn();

            response = new Response('', {
                onWriteHead: writeHeadMock,
                onWrite: writeMock,
                onEnd: endMock,
            });
        });

        it('should handle gzip compression', async () => {
            response.setOutputCompression('gzip');
            response.write('original gzip data');
            await response.end();

            expect(writeMock).toHaveBeenCalled();
            // Verify that the written data is compressed (not the original text)
            const writtenData = writeMock.mock.calls[0][0] as Buffer;
            expect(Buffer.isBuffer(writtenData)).toBe(true);
            expect(writtenData.toString()).not.toBe('original gzip data');
        });

        it('should handle brotli compression', async () => {
            response.setOutputCompression('br');
            response.write('original br data');
            await response.end();

            expect(writeMock).toHaveBeenCalled();
            const writtenData = writeMock.mock.calls[0][0] as Buffer;
            expect(Buffer.isBuffer(writtenData)).toBe(true);
            expect(writtenData.toString()).not.toBe('original br data');
        });

        it('should handle deflate compression', async () => {
            response.setOutputCompression('deflate');
            response.write('original deflate data');
            await response.end();

            expect(writeMock).toHaveBeenCalled();
            const writtenData = writeMock.mock.calls[0][0] as Buffer;
            expect(Buffer.isBuffer(writtenData)).toBe(true);
            expect(writtenData.toString()).not.toBe('original deflate data');
        });

        it('should set content-encoding header when compression is enabled', async () => {
            response.setOutputCompression('gzip');
            response.writeHead();
            await response.end();

            expect(response.getHeader('content-encoding')).toBe('gzip');
        });

        it('should delete content-length header when compression is enabled', async () => {
            response.setOutputCompression('gzip');
            response.setHeader('content-length', '100');
            response.writeHead();
            await response.end();

            expect(response.getHeader('content-length')).toBeUndefined();
        });

        it('should not compress if content is already compressed', async () => {
            response.setOutputCompression('gzip');
            response.setHeader('content-encoding', 'br'); // Already compressed with brotli

            response.writeHead();
            response.write('original br data');
            await response.end();

            // Should detect input compression and not add additional content-encoding
            expect(response.getHeader('content-encoding')).toBe('br');
            expect(writeMock).toHaveBeenCalledWith(Buffer.from('original br data'));
        });

        it('should prefer brotli over gzip and ignore order from accept-encoding header', async () => {
            response.setOutputCompression('gzip, deflate, br');
            response.writeHead();

            expect(response.getHeader('content-encoding')).toBe('br');
        });

        it('should not compress if content-type is not compressable', async () => {
            response.setHeader('content-type', 'image/jpeg');
            response.setOutputCompression('gzip');
            response.writeHead();
            response.write('original data');
            await response.end();

            expect(response.getHeader('content-encoding')).toBeUndefined();
            expect(writeMock).toHaveBeenCalledWith(Buffer.from('original data'));
        });

        it('should not compress if accept-encoding algorithm is not supported', async () => {
            response.setOutputCompression('zstd');
            response.writeHead();
            response.write('original data');
            await response.end();

            expect(response.getHeader('content-encoding')).toBeUndefined();
            expect(writeMock).toHaveBeenCalledWith(Buffer.from('original data'));
        });

        it('should check if content is compressable based on content-type', () => {
            const testCases = [
                { contentType: 'text/html', expected: true },
                { contentType: 'text/css', expected: true },
                { contentType: 'application/json', expected: true },
                { contentType: 'application/javascript', expected: true },
                { contentType: 'application/xml', expected: true },
                { contentType: 'image/svg+xml', expected: true },
                { contentType: 'image/jpeg', expected: false },
                { contentType: 'image/png', expected: false },
                { contentType: 'video/mp4', expected: false },
                { contentType: 'audio/mpeg', expected: false },
            ];

            testCases.forEach(({ contentType, expected }) => {
                response = new Response('');
                response.setHeader('content-type', contentType);

                expect(response.isCompressable()).toBe(expected);
            });
        });
    });
});
