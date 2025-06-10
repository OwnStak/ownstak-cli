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
    });

    describe('initialization', () => {
        it('should initialize with default values', () => {
            expect(response.statusCode).toBe(200);
            expect(response.headers).toEqual({});
            expect(response.body).toBeUndefined();
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
            expect(response.body).toBe(body);
            expect(Buffer.isBuffer(response.body)).toBe(true);
        });
    });

    describe('status codes', () => {
        const statusCodes = [
            { code: 200, description: 'OK' },
            { code: 201, description: 'Created' },
            { code: 204, description: 'No Content' },
            { code: 301, description: 'Moved Permanently' },
            { code: 302, description: 'Found' },
            { code: 304, description: 'Not Modified' },
            { code: 400, description: 'Bad Request' },
            { code: 401, description: 'Unauthorized' },
            { code: 403, description: 'Forbidden' },
            { code: 404, description: 'Not Found' },
            { code: 422, description: 'Unprocessable Entity' },
            { code: 500, description: 'Internal Server Error' },
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

            expect(response.body).toBe(bufferBody);
            expect(response.body?.toString()).toBe('Buffer content');
        });

        it('should handle JSON body', () => {
            const jsonData = { message: 'hello', status: 'success' };
            const jsonBody = JSON.stringify(jsonData);
            response.body = jsonBody;
            response.setHeader('content-type', 'application/json');

            expect(response.body).toBe(jsonBody);
            expect(JSON.parse(response.body.toString())).toEqual(jsonData);
        });

        it('should handle HTML body', () => {
            const htmlBody = '<html><body><h1>Hello World</h1></body></html>';
            response.body = htmlBody;
            response.setHeader('content-type', 'text/html');

            expect(response.body).toBe(htmlBody);
            expect(response.getHeader('content-type')).toBe('text/html');
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
            expect(decodedBody).toBe('Plain text response');
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
            response.setHeader('accept', 'application/json');

            const event = response.toEvent();

            // Array headers should be converted to first value only
            expect(event.headers?.['set-cookie']).toBe('session=abc123');
            expect(event.headers?.['accept']).toBe('application/json');
        });

        it('should remove AWS headers in toEvent', () => {
            response.setHeader('x-amz-request-id', 'test-request-id');
            response.setHeader('x-amzn-trace-id', 'test-trace-id');
            response.setHeader('content-type', 'application/json');

            const event = response.toEvent();

            expect(event.headers?.['x-amz-request-id']).toBeUndefined();
            expect(event.headers?.['x-amzn-trace-id']).toBeUndefined();
            expect(event.headers?.['content-type']).toBe('application/json');
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

        it('should handle string body in toNodeResponse', () => {
            response.statusCode = 200;
            response.body = 'Plain text response';
            response.setHeader('content-type', 'text/plain');

            response.toNodeResponse(mockResponse as any);

            expect(mockResponse.writeHead).toHaveBeenCalledWith(200, {
                'content-type': 'text/plain',
            });
            expect(mockResponse.end).toHaveBeenCalledWith('Plain text response');
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
            expect(mockResponse.end).toHaveBeenCalledWith(undefined);
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
                { code: 200, body: 'OK' },
                { code: 404, body: 'Not Found' },
                { code: 500, body: 'Internal Server Error' },
                { code: 302, body: '' },
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

    describe('deleteAmznHeaders method', () => {
        it('should delete AWS headers', () => {
            response.setHeader('x-amz-request-id', 'request-123');
            response.setHeader('x-amzn-trace-id', 'trace-456');
            response.setHeader('x-amz-security-token', 'token-789');
            response.setHeader('content-type', 'application/json');
            response.setHeader('x-custom-header', 'keep-this');

            response.deleteAmznHeaders();

            expect(response.getHeader('x-amz-request-id')).toBeUndefined();
            expect(response.getHeader('x-amzn-trace-id')).toBeUndefined();
            expect(response.getHeader('x-amz-security-token')).toBeUndefined();
            expect(response.getHeader('content-type')).toBe('application/json');
            expect(response.getHeader('x-custom-header')).toBe('keep-this');
        });

        it('should handle case variations of AWS headers', () => {
            response.setHeader('X-AMZ-Request-Id', 'request-123');
            response.setHeader('X-AMZN-Trace-Id', 'trace-456');
            response.setHeader('Content-Type', 'application/json');

            response.deleteAmznHeaders();

            expect(response.getHeader('x-amz-request-id')).toBeUndefined();
            expect(response.getHeader('x-amzn-trace-id')).toBeUndefined();
            expect(response.getHeader('content-type')).toBe('application/json');
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
            expect(response.body).toBeUndefined();
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
            expect(response.body).toBeUndefined();
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
            expect(mockResp.end).toHaveBeenCalledWith(null);
        });

        it('should handle very large response bodies', () => {
            const largeBody = 'x'.repeat(1000000); // 1MB string
            response.body = largeBody;

            const event = response.toEvent();
            const decodedBody = Buffer.from(event.body || '', 'base64').toString();
            expect(decodedBody).toBe(largeBody);

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
});
