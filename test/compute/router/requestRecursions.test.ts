import { jest } from '@jest/globals';

// Mock the http and https modules BEFORE importing the module under test
const mockHttpGet = jest.fn();
const mockHttpRequest = jest.fn();
const mockHttpsGet = jest.fn();
const mockHttpsRequest = jest.fn();
const mockFetch = jest.fn();

// Mock the modules before any imports
jest.unstable_mockModule('http', () => ({
    default: {
        get: mockHttpGet,
        request: mockHttpRequest,
    },
    get: mockHttpGet,
    request: mockHttpRequest,
}));

jest.unstable_mockModule('https', () => ({
    default: {
        get: mockHttpsGet,
        request: mockHttpsRequest,
    },
    get: mockHttpsGet,
    request: mockHttpsRequest,
}));

// Mock global fetch
globalThis.fetch = mockFetch as any;

// Now import the modules under test
const { detectRequestRecursions, overrideHttpClient, overrideFetchClient } = await import('../../../src/compute/router/requestRecursions.js');
const { Request } = await import('../../../src/compute/router/request.js');
const { HEADERS } = await import('../../../src/constants.js');
const http = await import('http');
const https = await import('https');

describe('requestRecursion', () => {
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Set up mock implementations that return a minimal response object
        mockHttpGet.mockReturnValue({ on: jest.fn(), end: jest.fn() });
        mockHttpRequest.mockReturnValue({ on: jest.fn(), end: jest.fn() });
        mockHttpsGet.mockReturnValue({ on: jest.fn(), end: jest.fn() });
        mockHttpsRequest.mockReturnValue({ on: jest.fn(), end: jest.fn() });
        mockFetch.mockImplementation(() => Promise.resolve(new Response()));
    });

    describe('detectRequestRecursions', () => {
        it('should not throw error when recursion count is within limit', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '0');

            expect(() => {
                detectRequestRecursions(request, 1);
            }).not.toThrow();
        });

        it('should not throw error when recursion count equals limit', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '1');

            expect(() => {
                detectRequestRecursions(request, 1);
            }).not.toThrow();
        });

        it('should throw error when recursion count exceeds limit', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '2');

            expect(() => {
                detectRequestRecursions(request, 1);
            }).toThrow('The maximum number of allowed recursion requests (1) has been reached.');
        });

        it('should handle missing recursion header (defaults to 0)', () => {
            const request = new Request('https://example.com');

            expect(() => {
                detectRequestRecursions(request, 1);
            }).not.toThrow();
        });

        it('should handle invalid recursion header (defaults to 0)', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, 'invalid');

            expect(() => {
                detectRequestRecursions(request, 1);
            }).not.toThrow();
        });

        it('should use default recursion limit of 5', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '6');

            expect(() => {
                detectRequestRecursions(request);
            }).toThrow('The maximum number of allowed recursion requests (5) has been reached.');
        });

        it('should override http and fetch clients after successful check', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '0');

            detectRequestRecursions(request, 1);

            // Verify that the clients have been overrideed by checking the headers are injected
            http.default.get('http://example.com', jest.fn());

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        [HEADERS.XOwnRecursions]: '1',
                    }),
                }),
                expect.any(Function),
            );
        });
    });

    describe('overrideHttpClient', () => {
        it('should inject headers into http.get with string URL', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const callback = jest.fn();
            http.default.get('http://example.com', callback);

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });

        it('should inject headers into http.get with URL object', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const url = new URL('http://example.com');
            const callback = jest.fn();
            http.default.get(url, callback);

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });

        it('should inject headers into http.request', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const callback = jest.fn();
            http.default.request('http://example.com', callback);

            expect(mockHttpRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });

        it('should inject headers into https.get', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const callback = jest.fn();
            https.default.get('https://example.com', callback);

            expect(mockHttpsGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });

        it('should inject headers into https.request', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const callback = jest.fn();
            https.default.request('https://example.com', callback);

            expect(mockHttpsRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });

        it('should preserve existing headers and merge with injected headers', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const options = {
                headers: { 'existing-header': 'existing-value' },
            };
            const callback = jest.fn();

            http.default.get('http://example.com', options, callback);

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                        'existing-header': 'existing-value',
                    }),
                }),
                callback,
            );
        });

        it('should handle missing headers object', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const options = {}; // No headers property
            const callback = jest.fn();

            http.default.get('http://example.com', options, callback);

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });

        it('should work with empty headers object', () => {
            const testHeaders = {};
            overrideHttpClient(testHeaders);

            const callback = jest.fn();
            http.default.get('http://example.com', callback);

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: {},
                }),
                callback,
            );
        });

        it('should convert string URL to URL object when needed', () => {
            const testHeaders = { 'x-test': 'value' };
            overrideHttpClient(testHeaders);

            const callback = jest.fn();
            http.default.get('http://example.com', callback);

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    protocol: 'http:',
                    hostname: 'example.com',
                    path: '/',
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
                callback,
            );
        });
    });

    describe('overrideFetchClient', () => {
        it('should inject headers into fetch with string URL', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            await fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
            );
        });

        it('should inject headers into fetch with URL object', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            const url = new URL('https://example.com');
            await fetch(url);

            expect(mockFetch).toHaveBeenCalledWith(
                url,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
            );
        });

        it('should inject headers into fetch with Request object', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            const request = new globalThis.Request('https://example.com');
            await fetch(request);

            expect(mockFetch).toHaveBeenCalledWith(
                request,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
            );
        });

        it('should preserve existing headers and merge with injected headers', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            await fetch('https://example.com', {
                headers: { 'existing-header': 'existing-value' },
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                        'existing-header': 'existing-value',
                    }),
                }),
            );
        });

        it('should handle missing options object', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            await fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
            );
        });

        it('should handle missing headers in options', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            await fetch('https://example.com', { method: 'POST' });

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-test': 'value',
                    }),
                }),
            );
        });

        it('should work with empty headers object', async () => {
            const testHeaders = {};
            overrideFetchClient(testHeaders);

            await fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: {},
                }),
            );
        });

        it('should handle Headers object in existing options', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            const headers = new Headers();
            headers.set('existing-header', 'existing-value');

            await fetch('https://example.com', { headers });

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                        // Note: Headers object merging may need special handling
                    }),
                }),
            );
        });

        it('should handle array format headers in existing options', async () => {
            const testHeaders = { 'x-test': 'value' };
            overrideFetchClient(testHeaders);

            await fetch('https://example.com', {
                headers: [['existing-header', 'existing-value']],
            });

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'x-test': 'value',
                        // Note: Array headers merging may need special handling
                    }),
                }),
            );
        });

        describe('response consumption methods', () => {
            beforeEach(() => {
                // Reset and set up more detailed mock responses for consumption tests
                jest.clearAllMocks();

                const testHeaders = { 'x-test': 'value' };
                overrideFetchClient(testHeaders);
            });

            it('should work with response.text()', async () => {
                const mockTextResponse = 'Hello, World!';
                const mockResponse = new Response(mockTextResponse, {
                    headers: { 'content-type': 'text/plain' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/text');
                const text = await response.text();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/text',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );
                expect(text).toBe(mockTextResponse);
            });

            it('should work with response.json()', async () => {
                const mockJsonData = { message: 'Hello, World!', status: 'success' };
                const mockResponse = new Response(JSON.stringify(mockJsonData), {
                    headers: { 'content-type': 'application/json' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/json');
                const json = await response.json();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/json',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );
                expect(json).toEqual(mockJsonData);
            });

            it('should work with response.arrayBuffer()', async () => {
                const mockData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" in bytes
                const mockResponse = new Response(mockData, {
                    headers: { 'content-type': 'application/octet-stream' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/binary');
                const arrayBuffer = await response.arrayBuffer();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/binary',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );
                expect(new Uint8Array(arrayBuffer)).toEqual(mockData);
            });

            it('should work with response.blob()', async () => {
                const mockBlobData = 'Hello, Blob!';
                const mockResponse = new Response(mockBlobData, {
                    headers: { 'content-type': 'text/plain' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/blob');
                const blob = await response.blob();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/blob',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );
                expect(blob.type).toBe('text/plain');
                // Verify blob content by reading it as text
                const blobText = await blob.text();
                expect(blobText).toBe(mockBlobData);
            });

            it('should work with response.body.getReader() for streaming', async () => {
                const mockStreamData = 'Hello, streaming world!';
                const mockResponse = new Response(mockStreamData, {
                    headers: { 'content-type': 'text/plain' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/stream');
                const reader = response.body?.getReader();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/stream',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );

                expect(reader).toBeDefined();

                if (reader) {
                    const decoder = new TextDecoder('utf-8');
                    const buffer: string[] = [];

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer.push(decoder.decode(value));
                    }

                    const result = buffer.join('');
                    expect(result).toBe(mockStreamData);
                }
            });

            it('should work with chunked streaming response', async () => {
                // Create a ReadableStream that emits data in chunks
                const chunks = ['Hello, ', 'chunked ', 'streaming!'];
                let chunkIndex = 0;

                const stream = new ReadableStream({
                    start(controller) {
                        function pump() {
                            if (chunkIndex < chunks.length) {
                                const chunk = chunks[chunkIndex++];
                                controller.enqueue(new TextEncoder().encode(chunk));
                                pump();
                            } else {
                                controller.close();
                            }
                        }
                        pump();
                    },
                });

                const mockResponse = new Response(stream, {
                    headers: { 'content-type': 'text/plain' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/chunked');
                const reader = response.body?.getReader();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/chunked',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );

                expect(reader).toBeDefined();

                if (reader) {
                    const decoder = new TextDecoder('utf-8');
                    const buffer: string[] = [];

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer.push(decoder.decode(value));
                    }

                    const result = buffer.join('');
                    expect(result).toBe('Hello, chunked streaming!');
                }
            });

            it('should work with response.formData()', async () => {
                const formData = new FormData();
                formData.append('name', 'John Doe');
                formData.append('email', 'john@example.com');

                const mockResponse = new Response(formData);
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/form');
                const responseFormData = await response.formData();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/form',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );
                expect(responseFormData.get('name')).toBe('John Doe');
                expect(responseFormData.get('email')).toBe('john@example.com');
            });

            it('should handle response consumption with POST request', async () => {
                const mockJsonResponse = { success: true, id: 123 };
                const mockResponse = new Response(JSON.stringify(mockJsonResponse), {
                    status: 201,
                    headers: { 'content-type': 'application/json' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const postData = { name: 'Test User', email: 'test@example.com' };
                const response = await fetch('https://example.com/api/users', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(postData),
                });
                const json = await response.json();

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/api/users',
                    expect.objectContaining({
                        method: 'POST',
                        headers: expect.objectContaining({
                            'x-test': 'value',
                            'content-type': 'application/json',
                        }),
                        body: JSON.stringify(postData),
                    }),
                );
                expect(response.status).toBe(201);
                expect(json).toEqual(mockJsonResponse);
            });

            it('should handle errors during response consumption', async () => {
                // Mock a response that will fail during JSON parsing
                const mockResponse = new Response('invalid json content', {
                    headers: { 'content-type': 'application/json' },
                });
                (mockFetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

                const response = await fetch('https://example.com/invalid-json');

                expect(mockFetch).toHaveBeenCalledWith(
                    'https://example.com/invalid-json',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-test': 'value',
                        }),
                    }),
                );

                // Attempting to parse invalid JSON should throw an error
                await expect(response.json()).rejects.toThrow();
            });
        });
    });

    describe('integration tests', () => {
        it('should work together - detectRequestRecursions should set up overrideed clients', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '0');

            detectRequestRecursions(request, 2);

            // Test that http client has the recursion header injected
            http.default.get('http://example.com', jest.fn());
            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        [HEADERS.XOwnRecursions]: '1',
                    }),
                }),
                expect.any(Function),
            );

            // Test that fetch client has the recursion header injected
            fetch('https://example.com');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        [HEADERS.XOwnRecursions]: '1',
                    }),
                }),
            );
        });

        it('should handle multiple recursion levels correctly', () => {
            // First level - should not throw
            const request1 = new Request('https://example.com');
            request1.setHeader(HEADERS.XOwnRecursions, '0');

            expect(() => {
                detectRequestRecursions(request1, 3);
            }).not.toThrow();

            // Second level - should not throw
            const request2 = new Request('https://example.com');
            request2.setHeader(HEADERS.XOwnRecursions, '1');

            expect(() => {
                detectRequestRecursions(request2, 3);
            }).not.toThrow();

            // Third level - should not throw
            const request3 = new Request('https://example.com');
            request3.setHeader(HEADERS.XOwnRecursions, '3');

            expect(() => {
                detectRequestRecursions(request3, 3);
            }).not.toThrow();

            // Fourth level - should throw
            const request4 = new Request('https://example.com');
            request4.setHeader(HEADERS.XOwnRecursions, '4');

            expect(() => {
                detectRequestRecursions(request4, 3);
            }).toThrow();
        });

        it('should prevent infinite recursion at the specified limit', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '5');

            expect(() => {
                detectRequestRecursions(request, 4);
            }).toThrow('The maximum number of allowed recursion requests (4) has been reached.');
        });

        it('should properly increment recursion counter in headers', () => {
            const request = new Request('https://example.com');
            request.setHeader(HEADERS.XOwnRecursions, '2');

            detectRequestRecursions(request, 5);

            // Test that the incremented counter (3) is used in http clients
            http.default.get('http://example.com', jest.fn());

            expect(mockHttpGet).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        [HEADERS.XOwnRecursions]: '3',
                    }),
                }),
                expect.any(Function),
            );

            // Test that the incremented counter (3) is used in fetch
            fetch('https://example.com');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        [HEADERS.XOwnRecursions]: '3',
                    }),
                }),
            );
        });
    });
});
