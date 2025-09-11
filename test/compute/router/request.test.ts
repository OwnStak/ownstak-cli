import { Request } from '../../../src/compute/router/request.js';
import { EventEmitter } from 'events';
import { ProxyRequestEvent } from '../../../src/compute/router/proxyRequestEvent.js';
import { HEADERS } from '../../../src/constants.js';
import http from 'http';

class MockSocket extends EventEmitter {
    encrypted = false;
    localPort = 8080;
    remoteAddress?: string;
}

class MockTLSSocket extends MockSocket {
    encrypted = true;
}

describe('Request', () => {
    describe('initialization', () => {
        it('should initialize with minimal options', () => {
            const request = new Request('http://example.com/path', {
                method: 'GET',
            });

            expect(request.url.toString()).toBe('http://example.com/path');
            expect(request.method).toBe('GET');
            expect(request.headers).toEqual({});
            expect(request.path).toBe('/path');
        });

        it('should handle query parameters in URL', () => {
            const request = new Request('http://example.com/products?id=123&category=books', {
                method: 'GET',
            });

            expect(request.url.searchParams.get('id')).toBe('123');
            expect(request.url.searchParams.get('category')).toBe('books');
            expect(request.path).toBe('/products');
        });

        it('should extract host and protocol from URL', () => {
            const request = new Request('https://app.example.com/api/v1/data', {
                method: 'POST',
            });

            expect(request.host).toBe('app.example.com');
            expect(request.protocol).toBe('https');
        });

        it('should initialize with custom headers', () => {
            const request = new Request('http://example.com', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer token123',
                },
            });

            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('authorization')).toBe('Bearer token123');
        });

        it('should initialize with body', () => {
            const body = JSON.stringify({ test: 'data' });
            const request = new Request('http://example.com', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body,
            });

            expect(request.body).toBe(body);
        });

        it('should initialize with params', () => {
            const request = new Request('http://example.com/users/:id', {
                method: 'GET',
                params: {
                    id: '123',
                },
            });

            expect(request.params).toEqual({ id: '123' });
        });
    });

    describe('header methods', () => {
        it('should get header value', () => {
            const request = new Request('http://example.com', {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': 'test-key',
                },
            });

            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('x-api-key')).toBe('test-key');
            expect(request.getHeader('non-existent')).toBeUndefined();
        });

        it('should handle case-insensitive header names', () => {
            const request = new Request('http://example.com', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('CONTENT-TYPE')).toBe('application/json');
        });

        it('should get array of header values', () => {
            const request = new Request('http://example.com', {
                method: 'GET',
            });

            request.headers = {
                'set-cookie': ['session=abc123', 'user=john'],
                accept: 'application/json',
            };

            expect(request.getHeaderArray('set-cookie')).toEqual(['session=abc123', 'user=john']);
            expect(request.getHeaderArray('accept')).toEqual(['application/json']);
            expect(request.getHeaderArray('non-existent')).toEqual([]);
        });

        it('should set and get headers', () => {
            const request = new Request('http://example.com');

            request.setHeader('content-type', 'application/json');
            request.setHeader('x-api-key', 'new-key');

            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('x-api-key')).toBe('new-key');
        });

        it('should add headers', () => {
            const request = new Request('http://example.com');

            request.setHeader('accept', 'application/json');
            request.addHeader('accept', 'text/html');

            expect(request.getHeaderArray('accept')).toEqual(['application/json', 'text/html']);
        });

        it('should set multiple headers at once', () => {
            const request = new Request('http://example.com');

            request.setHeaders({
                'content-type': 'application/json',
                authorization: 'Bearer token',
            });

            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('authorization')).toBe('Bearer token');
        });

        it('should add multiple headers at once', () => {
            const request = new Request('http://example.com');

            request.setHeader('accept', 'application/json');
            request.addHeaders({
                accept: 'text/html',
                'x-custom': 'custom-value',
            });

            expect(request.getHeaderArray('accept')).toEqual(['application/json', 'text/html']);
            expect(request.getHeader('x-custom')).toBe('custom-value');
        });

        it('should delete headers', () => {
            const request = new Request('http://example.com', {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': 'test-key',
                },
            });

            request.deleteHeader('x-api-key');

            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('x-api-key')).toBeUndefined();
        });
    });

    describe('cookie methods', () => {
        it('should get cookie value', () => {
            const request = new Request('http://example.com', {
                method: 'GET',
            });

            request.headers = {
                cookie: 'session=abc123; user=john; theme=dark',
            };

            expect(request.getCookie('session')).toBe('abc123');
            expect(request.getCookie('user')).toBe('john');
            expect(request.getCookie('theme')).toBe('dark');
            expect(request.getCookie('non-existent')).toBeUndefined();
        });

        it('should get array of cookie values', () => {
            const request = new Request('http://example.com', {
                method: 'GET',
            });

            request.headers = {
                cookie: 'multi=value1; multi=value2; single=value',
            };

            expect(request.getCookieArray('multi')).toContain('value1');
            expect(request.getCookieArray('multi')).toContain('value2');
            expect(request.getCookieArray('single')).toEqual(['value']);
            expect(request.getCookieArray('non-existent')).toEqual([]);
        });

        it('should set cookie value', () => {
            const request = new Request('http://example.com');

            request.setCookie('session', 'new-session');
            request.setCookie('user', 'alice');

            expect(request.getCookie('session')).toBe('new-session');
            expect(request.getCookie('user')).toBe('alice');
            expect(request.getHeader('cookie')).toBe('session=new-session; user=alice');
        });

        it('should delete cookie', () => {
            const request = new Request('http://example.com');

            request.setCookie('session', 'abc123');
            request.setCookie('user', 'john');
            request.deleteCookie('session');

            expect(request.getCookie('session')).toBeUndefined();
            expect(request.getCookie('user')).toBe('john');
            expect(request.getHeader('cookie')).toBe('user=john');
        });

        it('should handle cookies with special characters', () => {
            const request = new Request('http://example.com');

            request.setCookie('complex', 'value=with;special:chars');

            expect(request.getCookie('complex')).toBe('value=with;special:chars');
        });
    });

    describe('query methods', () => {
        it('should get query parameter value', () => {
            const request = new Request('http://example.com/search?q=test&page=2&sort=asc', {
                method: 'GET',
            });

            expect(request.getQuery('q')).toBe('test');
            expect(request.getQuery('page')).toBe('2');
            expect(request.getQuery('sort')).toBe('asc');
            expect(request.getQuery('non-existent')).toBeUndefined();
        });

        it('should get array of query parameter values', () => {
            const request = new Request('http://example.com/products?tag=new&tag=sale&category=books', {
                method: 'GET',
            });

            expect(request.getQueryArray('tag')).toEqual(['new', 'sale']);
            expect(request.getQueryArray('category')).toEqual(['books']);
            expect(request.getQueryArray('non-existent')).toEqual([]);
        });

        it('should set query parameter value', () => {
            const request = new Request('http://example.com/search?q=test');

            request.setQuery('page', '2');
            request.setQuery('q', 'updated');

            expect(request.getQuery('q')).toBe('updated');
            expect(request.getQuery('page')).toBe('2');
            expect(request.url.toString()).toBe('http://example.com/search?q=updated&page=2');
        });
    });

    describe('path handling', () => {
        it('should get and set path', () => {
            const request = new Request('http://example.com/old-path');

            expect(request.path).toBe('/old-path');

            request.path = '/new-path';

            expect(request.path).toBe('/new-path');
            expect(request.url.toString()).toBe('http://example.com/new-path');
        });

        it('should handle URL encoded paths', () => {
            const request = new Request('http://example.com/path%20with%20spaces');

            expect(request.path).toBe('/path with spaces');
        });

        it('should get path extension', () => {
            const request = new Request('http://example.com/image.jpg');

            expect(request.pathExtension).toBe('jpg');

            request.path = '/document.pdf';
            // Clearing cached extension
            request._pathExtension = undefined;

            expect(request.pathExtension).toBe('pdf');
        });
    });

    describe('body handling', () => {
        it('should handle request with body', () => {
            const request = new Request('http://example.com/api', {
                method: 'POST',
            });

            request.headers = {
                'content-type': 'application/json',
            };

            const body = Buffer.from(JSON.stringify({ name: 'Test', value: 123 }));
            request.body = body;

            expect(request.body).toEqual(body);
            expect(JSON.parse(request.body!.toString())).toEqual({ name: 'Test', value: 123 });
        });

        it('should handle string body', () => {
            const request = new Request('http://example.com/api', {
                method: 'POST',
                headers: {
                    'content-type': 'text/plain',
                },
                body: 'Plain text body',
            });

            expect(request.body).toBe('Plain text body');
        });
    });

    describe('fromEvent', () => {
        it('should create a request from raw proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    'content-type': 'application/json',
                    host: 'api.example.com',
                    'x-forwarded-proto': 'https',
                    'x-forwarded-port': '443',
                },
                rawPath: '/api/users',
                rawQueryString: 'id=123',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/users',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: JSON.stringify({ test: 'data' }),
                isBase64Encoded: false,
            };

            // And test the created request properties
            const request = Request.fromEvent(event);
            expect(request.method).toBe('GET');
            expect(request.url.toString()).toBe('https://api.example.com/api/users?id=123');
            expect(request.getQuery('id')).toBe('123');
            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.body?.toString()).toEqual(JSON.stringify({ test: 'data' }));
        });

        it('should create a request from base64 encoded proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    'content-type': 'application/json',
                    host: 'api.example.com',
                    'x-forwarded-proto': 'https',
                    'x-forwarded-port': '443',
                },
                rawPath: '/api/users',
                rawQueryString: 'id=123',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/users',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: Buffer.from(JSON.stringify({ test: 'data' })).toString('base64'),
                isBase64Encoded: true,
            };

            // And test the created request properties
            const request = Request.fromEvent(event);
            expect(request.method).toBe('GET');
            expect(request.url.toString()).toBe('https://api.example.com/api/users?id=123');
            expect(request.getQuery('id')).toBe('123');
            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.body?.toString()).toEqual(JSON.stringify({ test: 'data' }));
        });

        it('should use values from x-forwarded-* headers when provided', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    'x-forwarded-proto': 'https',
                    'x-forwarded-host': 'original-host.com',
                    'x-forwarded-port': '8443',
                    'x-forwarded-for': '10.0.0.1, 192.168.1.100',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test that all x-forwarded headers are preserved
            expect(request.getHeader('x-forwarded-proto')).toBe('https');
            expect(request.getHeader('x-forwarded-host')).toBe('original-host.com');
            expect(request.getHeader('x-forwarded-port')).toBe('8443');
            expect(request.getHeader('x-forwarded-for')).toBe('10.0.0.1, 192.168.1.100');
        });

        it('should auto-populate missing x-forwarded-* header values from event properties or defaults', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    // Missing all x-forwarded headers
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test that missing x-forwarded headers are auto-populated
            expect(request.getHeader('x-forwarded-proto')).toBe('https'); // from request.protocol
            expect(request.getHeader('x-forwarded-host')).toBe('api.example.com'); // from request.host
            expect(request.getHeader('x-forwarded-port')).toBe('443'); // from HTTPS default port
            expect(request.getHeader('x-forwarded-for')).toBe('192.168.1.1');
        });

        it('should correctly x-forwarded-* headers with comma-separated values', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    'x-forwarded-host': 'original-host.com, proxy1.com, proxy2.com',
                    'x-forwarded-proto': 'https, http',
                    'x-forwarded-port': '443, 80',
                    'x-forwarded-for': '10.0.0.1, 192.168.1.100',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);
            expect(request.getHeader('x-forwarded-host')).toBe('original-host.com, proxy1.com, proxy2.com');
            expect(request.getHeader('x-forwarded-proto')).toBe('https, http');
            expect(request.getHeader('x-forwarded-port')).toBe('443, 80');
            expect(request.getHeader('x-forwarded-for')).toBe('10.0.0.1, 192.168.1.100');
        });

        it('should set host header to original host header from x-forwarded-host header', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    'x-forwarded-host': 'original-host.com, proxy1.com, proxy2.com',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            expect(request.host).toBe('original-host.com');
            expect(request.getHeader('host')).toBe('original-host.com');
            expect(request.getHeader('x-forwarded-host')).toBe('original-host.com, proxy1.com, proxy2.com');
        });

        it('should correctly parse query parameters from rawQueryString', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                },
                rawPath: '/api/search',
                rawQueryString: 'q=test&page=2&sort=asc&category=books',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/search',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            expect(request.getQuery('q')).toBe('test');
            expect(request.getQuery('page')).toBe('2');
            expect(request.getQuery('sort')).toBe('asc');
            expect(request.getQuery('category')).toBe('books');
            expect(request.url.toString()).toBe('https://api.example.com/api/search?q=test&page=2&sort=asc&category=books');
        });

        it('should handle duplicate query parameters from rawQueryString', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                },
                rawPath: '/api/products',
                rawQueryString: 'tag=new&tag=sale&tag=featured&category=books',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/products',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            expect(request.getQuery('tag')).toBe('new'); // First value
            expect(request.getQueryArray('tag')).toEqual(['new', 'sale', 'featured']);
            expect(request.getQuery('category')).toBe('books');
            expect(request.getQueryArray('category')).toEqual(['books']);
        });

        it('should handle URL-encoded query parameters from rawQueryString', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                },
                rawPath: '/api/search',
                rawQueryString: 'q=hello%20world&special=%3D%26%23%25&utf8=%C3%A9%C3%A0%C3%A8',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/search',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            expect(request.getQuery('q')).toBe('hello world');
            expect(request.getQuery('special')).toBe('=&#%');
            expect(request.getQuery('utf8')).toBe('éàè');
        });

        it('should handle empty and no-value query parameters from rawQueryString', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                },
                rawPath: '/api/test',
                rawQueryString: 'empty=&novalue&normal=test&another=',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            expect(request.getQuery('empty')).toBe('');
            expect(request.getQuery('novalue')).toBe('');
            expect(request.getQuery('normal')).toBe('test');
            expect(request.getQuery('another')).toBe('');
        });

        it('should handle empty rawQueryString', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            expect(request.url.toString()).toBe('https://api.example.com/api/test');
            expect(request.getQuery('anything')).toBeUndefined();
            expect(request.getQueryArray('anything')).toEqual([]);
        });

        it('should handle headers case insensitively from proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'X-API-Key': 'secret-api-key',
                    'user-agent': 'Custom User Agent/1.0',
                    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
                    'x-custom-header': 'custom-value-123',
                    HOST: 'api.example.com',
                    'Cache-Control': 'no-cache',
                    'X-Forwarded-For': '203.0.113.195, 70.41.3.18, 150.172.238.178',
                },
                rawPath: '/api/test',
                rawQueryString: 'param1=value1&param2=value2',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'POST',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '203.0.113.195',
                        userAgent: 'Custom User Agent/1.0',
                    },
                },
                body: JSON.stringify({ message: 'test data' }),
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test that headers can be accessed with different cases
            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('Content-Type')).toBe('application/json');
            expect(request.getHeader('CONTENT-TYPE')).toBe('application/json');
            expect(request.getHeader('Content-type')).toBe('application/json');

            expect(request.getHeader('accept-encoding')).toBe('gzip, deflate, br');
            expect(request.getHeader('Accept-Encoding')).toBe('gzip, deflate, br');
            expect(request.getHeader('ACCEPT-ENCODING')).toBe('gzip, deflate, br');

            expect(request.getHeader('x-api-key')).toBe('secret-api-key');
            expect(request.getHeader('X-API-Key')).toBe('secret-api-key');
            expect(request.getHeader('X-API-KEY')).toBe('secret-api-key');
            expect(request.getHeader('x-Api-Key')).toBe('secret-api-key');

            expect(request.getHeader('user-agent')).toBe('Custom User Agent/1.0');
            expect(request.getHeader('User-Agent')).toBe('Custom User Agent/1.0');
            expect(request.getHeader('USER-AGENT')).toBe('Custom User Agent/1.0');

            expect(request.getHeader('authorization')).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(request.getHeader('Authorization')).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(request.getHeader('AUTHORIZATION')).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

            expect(request.getHeader('x-custom-header')).toBe('custom-value-123');
            expect(request.getHeader('X-Custom-Header')).toBe('custom-value-123');
            expect(request.getHeader('X-CUSTOM-HEADER')).toBe('custom-value-123');

            expect(request.getHeader('host')).toBe('api.example.com');
            expect(request.getHeader('Host')).toBe('api.example.com');
            expect(request.getHeader('HOST')).toBe('api.example.com');

            expect(request.getHeader('cache-control')).toBe('no-cache');
            expect(request.getHeader('Cache-Control')).toBe('no-cache');
            expect(request.getHeader('CACHE-CONTROL')).toBe('no-cache');

            expect(request.getHeader('x-forwarded-for')).toBe('203.0.113.195, 70.41.3.18, 150.172.238.178');
            expect(request.getHeader('X-Forwarded-For')).toBe('203.0.113.195, 70.41.3.18, 150.172.238.178');
            expect(request.getHeader('X-FORWARDED-FOR')).toBe('203.0.113.195, 70.41.3.18, 150.172.238.178');
            expect(request.getHeader('x-Forwarded-For')).toBe('203.0.113.195, 70.41.3.18, 150.172.238.178');
        });

        it('should handle mixed case headers in proxy event consistently', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    'CoNtEnT-tYpE': 'text/html',
                    aCcEpT: 'text/html,application/xhtml+xml',
                    'X-cUsToM-hEaDeR': 'MiXeD-cAsE-vAlUe',
                    hOsT: 'mixed-case.example.com',
                },
                rawPath: '/mixed-case',
                rawQueryString: '',
                requestContext: {
                    domainName: 'mixed-case.example.com',
                    domainPrefix: 'mixed-case',
                    http: {
                        method: 'GET',
                        path: '/mixed-case',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test accessing with normalized case
            expect(request.getHeader('content-type')).toBe('text/html');
            expect(request.getHeader('accept')).toBe('text/html,application/xhtml+xml');
            expect(request.getHeader('x-custom-header')).toBe('MiXeD-cAsE-vAlUe');
            expect(request.getHeader('host')).toBe('mixed-case.example.com');

            // Test accessing with different cases
            expect(request.getHeader('Content-Type')).toBe('text/html');
            expect(request.getHeader('ACCEPT')).toBe('text/html,application/xhtml+xml');
            expect(request.getHeader('X-Custom-Header')).toBe('MiXeD-cAsE-vAlUe');
            expect(request.getHeader('HOST')).toBe('mixed-case.example.com');

            // Test that the original mixed case is preserved in value but not in key access
            expect(request.getHeader('X-CUSTOM-HEADER')).toBe('MiXeD-cAsE-vAlUe'); // Value case preserved
        });

        it('should handle header arrays case insensitively from proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    Accept: 'application/json',
                    'X-Custom': 'value1',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Add additional header values to test arrays with different cases
            request.addHeader('X-Custom', 'value2');
            request.addHeader('x-custom', 'value3');
            request.addHeader('X-CUSTOM', 'value4');

            expect(request.getHeaderArray('accept')).toEqual(['application/json']);
            expect(request.getHeaderArray('Accept')).toEqual(['application/json']);
            expect(request.getHeaderArray('ACCEPT')).toEqual(['application/json']);

            // Test that adding headers with different cases all contribute to the same logical header
            const customHeaders = request.getHeaderArray('x-custom');
            expect(customHeaders.length).toBeGreaterThanOrEqual(4); // Original + 3 added
            expect(customHeaders).toContain('value1');
            expect(customHeaders).toContain('value2');
            expect(customHeaders).toContain('value3');
            expect(customHeaders).toContain('value4');

            // Test accessing with different cases returns the same array
            expect(request.getHeaderArray('X-Custom')).toEqual(customHeaders);
            expect(request.getHeaderArray('X-CUSTOM')).toEqual(customHeaders);
            expect(request.getHeaderArray('x-CUSTOM')).toEqual(customHeaders);
        });

        it('should handle x-forwarded-* headers case insensitively from proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    'X-Forwarded-Proto': 'https',
                    'x-forwarded-host': 'original.example.com',
                    'X-FORWARDED-PORT': '8443',
                    'x-Forwarded-For': '203.0.113.1, 192.168.1.1',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test x-forwarded-proto with different cases
            expect(request.getHeader('x-forwarded-proto')).toBe('https');
            expect(request.getHeader('X-Forwarded-Proto')).toBe('https');
            expect(request.getHeader('X-FORWARDED-PROTO')).toBe('https');
            expect(request.getHeader('x-Forwarded-Proto')).toBe('https');

            // Test x-forwarded-host with different cases
            expect(request.getHeader('x-forwarded-host')).toBe('original.example.com');
            expect(request.getHeader('X-Forwarded-Host')).toBe('original.example.com');
            expect(request.getHeader('X-FORWARDED-HOST')).toBe('original.example.com');
            expect(request.getHeader('x-Forwarded-Host')).toBe('original.example.com');

            // Test x-forwarded-port with different cases
            expect(request.getHeader('x-forwarded-port')).toBe('8443');
            expect(request.getHeader('X-Forwarded-Port')).toBe('8443');
            expect(request.getHeader('X-FORWARDED-PORT')).toBe('8443');
            expect(request.getHeader('x-Forwarded-Port')).toBe('8443');

            // Test x-forwarded-for with different cases
            expect(request.getHeader('x-forwarded-for')).toBe('203.0.113.1, 192.168.1.1');
            expect(request.getHeader('X-Forwarded-For')).toBe('203.0.113.1, 192.168.1.1');
            expect(request.getHeader('X-FORWARDED-FOR')).toBe('203.0.113.1, 192.168.1.1');
            expect(request.getHeader('x-Forwarded-For')).toBe('203.0.113.1, 192.168.1.1');
        });

        it('should auto-populate missing x-own-recursion header to 0 in proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    // Missing x-own-recursion header
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test that recursion counter is set to 0 when missing
            expect(request.getHeader(HEADERS.XOwnRecursions)).toBe('0');
        });

        it('should preserve existing x-own-recursion header in proxy event', () => {
            const event: ProxyRequestEvent = {
                version: '2.0',
                headers: {
                    host: 'api.example.com',
                    [HEADERS.XOwnRecursions]: '7',
                },
                rawPath: '/api/test',
                rawQueryString: '',
                requestContext: {
                    domainName: 'api.example.com',
                    domainPrefix: 'api',
                    http: {
                        method: 'GET',
                        path: '/api/test',
                        protocol: 'https',
                        sourceIp: '192.168.1.1',
                        userAgent: 'test-agent',
                    },
                },
                body: undefined,
                isBase64Encoded: false,
            };

            const request = Request.fromEvent(event);

            // Test that existing recursion counter is preserved
            expect(request.getHeader(HEADERS.XOwnRecursions)).toBe('7');
        });
    });

    describe('fromNodeRequest', () => {
        it('should create a request from an HTTP incoming message', async () => {
            // Create a simple mock of an IncomingMessage
            const body = JSON.stringify({ test: 'data' });
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/users?id=123',
                method: 'POST',
                headers: {
                    host: 'example.com',
                    'content-type': 'application/json',
                },
                socket: socket,
                // Make it an async iterable for body reading
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(body);
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test basic properties
            expect(request.method).toBe('POST');
            expect(request.protocol).toBe('http'); // MockSocket is not TLS
            expect(request.host).toBe('example.com');
            expect(request.port).toBe(8080); // From MockSocket

            // Test URL and query params
            expect(request.url.toString()).toBe('http://example.com/api/users?id=123');
            expect(request.path).toBe('/api/users');
            expect(request.getQuery('id')).toBe('123');

            // Test headers
            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('host')).toBe('example.com');

            // Test body
            expect(request.body).toBeInstanceOf(Buffer);
            expect(JSON.parse(request.body!.toString())).toEqual({ test: 'data' });

            // Test original request is stored
            expect(request.originalNodeRequest).toBe(mockReq);
        });

        it('should detect HTTPS from TLS socket', async () => {
            // Create a simple mock with TLS socket
            const socket = new MockTLSSocket(); // This has encrypted = true
            const mockReq = {
                url: '/secure',
                method: 'GET',
                headers: {
                    host: 'secure.example.com',
                },
                socket: socket,
                // Empty body
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that it correctly identified this as HTTPS
            expect(request.protocol).toBe('https');
            expect(request.host).toBe('secure.example.com');
            expect(request.path).toBe('/secure');
            expect(request.url.protocol).toBe('https:');
        });

        it('should correctly parse query parameters from node request URL', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/search?q=test&page=2&sort=asc&category=books',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.getQuery('q')).toBe('test');
            expect(request.getQuery('page')).toBe('2');
            expect(request.getQuery('sort')).toBe('asc');
            expect(request.getQuery('category')).toBe('books');
            expect(request.url.toString()).toBe('http://api.example.com/api/search?q=test&page=2&sort=asc&category=books');
        });

        it('should handle duplicate query parameters from node request URL', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/products?tag=new&tag=sale&tag=featured&category=books',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.getQuery('tag')).toBe('new'); // First value
            expect(request.getQueryArray('tag')).toEqual(['new', 'sale', 'featured']);
            expect(request.getQuery('category')).toBe('books');
            expect(request.getQueryArray('category')).toEqual(['books']);
        });

        it('should handle URL-encoded query parameters from node request URL', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/search?q=hello%20world&special=%3D%26%23%25&utf8=%C3%A9%C3%A0%C3%A8',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.getQuery('q')).toBe('hello world');
            expect(request.getQuery('special')).toBe('=&#%');
            expect(request.getQuery('utf8')).toBe('éàè');
        });

        it('should handle empty and no-value query parameters from node request URL', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/test?empty=&novalue&normal=test&another=',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.getQuery('empty')).toBe('');
            expect(request.getQuery('novalue')).toBe('');
            expect(request.getQuery('normal')).toBe('test');
            expect(request.getQuery('another')).toBe('');
        });

        it('should handle complex query strings with mixed encoding from node request URL', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/complex?arr[]=1&arr[]=2&obj[key]=value&mixed=a%20b&mixed=c%2Bd&filter[name]=john&filter[age]=25',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.getQuery('arr[]')).toBe('1'); // First value
            expect(request.getQueryArray('arr[]')).toEqual(['1', '2']);
            expect(request.getQuery('obj[key]')).toBe('value');
            expect(request.getQuery('mixed')).toBe('a b'); // First value, URL decoded
            expect(request.getQueryArray('mixed')).toEqual(['a b', 'c+d']);
            expect(request.getQuery('filter[name]')).toBe('john');
            expect(request.getQuery('filter[age]')).toBe('25');
        });

        it('should handle node request URL with no query parameters', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/test',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.url.toString()).toBe('http://api.example.com/api/test');
            expect(request.getQuery('anything')).toBeUndefined();
            expect(request.getQueryArray('anything')).toEqual([]);
        });

        it('should handle node request URL with only question mark and no parameters', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/test?',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.url.toString()).toBe('http://api.example.com/api/test?');
            expect(request.getQuery('anything')).toBeUndefined();
            expect(request.getQueryArray('anything')).toEqual([]);
        });

        it('should use values from x-forwarded-* headers when provided in node request', async () => {
            const body = JSON.stringify({ test: 'data' });
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/test',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                    'x-forwarded-proto': 'https',
                    'x-forwarded-host': 'original-host.com',
                    'x-forwarded-port': '8443',
                    'x-forwarded-for': '10.0.0.1, 192.168.1.100',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(body);
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that all x-forwarded headers are preserved
            expect(request.getHeader('x-forwarded-proto')).toBe('https');
            expect(request.getHeader('x-forwarded-host')).toBe('original-host.com');
            expect(request.getHeader('x-forwarded-port')).toBe('8443');
            expect(request.getHeader('x-forwarded-for')).toBe('10.0.0.1, 192.168.1.100');
        });

        it('should auto-populate missing x-forwarded-* header values from node request properties or defaults', async () => {
            const body = JSON.stringify({ test: 'data' });
            const socket = new MockSocket();
            socket.remoteAddress = '192.168.1.100'; // Set remote address
            const mockReq = {
                url: '/api/test',
                method: 'POST',
                headers: {
                    host: 'api.example.com',
                    // Missing all x-forwarded headers
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(body);
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that missing x-forwarded headers are auto-populated
            expect(request.getHeader('x-forwarded-proto')).toBe('http'); // from request.protocol (HTTP socket)
            expect(request.getHeader('x-forwarded-host')).toBe('api.example.com'); // from request.host
            expect(request.getHeader('x-forwarded-port')).toBe('8080'); // from socket.localPort
            expect(request.getHeader('x-forwarded-for')).toBe('192.168.1.100'); // from socket.remoteAddress
        });

        it('should auto-populate x-forwarded-* header values for HTTPS requests', async () => {
            const body = JSON.stringify({ test: 'data' });
            const socket = new MockTLSSocket(); // TLS socket for HTTPS
            socket.remoteAddress = '10.0.0.1';
            const mockReq = {
                url: '/secure/api',
                method: 'PUT',
                headers: {
                    host: 'secure.example.com',
                    // Missing all x-forwarded headers
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(body);
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that missing x-forwarded headers are auto-populated for HTTPS
            expect(request.getHeader('x-forwarded-proto')).toBe('https'); // from TLS socket
            expect(request.getHeader('x-forwarded-host')).toBe('secure.example.com'); // from request.host
            expect(request.getHeader('x-forwarded-port')).toBe('8080'); // from socket.localPort
            expect(request.getHeader('x-forwarded-for')).toBe('10.0.0.1'); // from socket.remoteAddress
        });

        it('should handle partial x-forwarded-* header values and auto-populate missing ones in node request', async () => {
            const body = JSON.stringify({ partial: 'test' });
            const socket = new MockSocket();
            socket.remoteAddress = '172.16.0.1';
            const mockReq = {
                url: '/api/partial',
                method: 'PATCH',
                headers: {
                    host: 'partial.example.com',
                    'x-forwarded-for': '203.0.113.1', // Only this header is provided
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(body);
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that existing header is preserved and missing ones are auto-populated
            expect(request.getHeader('x-forwarded-for')).toBe('203.0.113.1'); // preserved from headers
            expect(request.getHeader('x-forwarded-proto')).toBe('http'); // auto-populated
            expect(request.getHeader('x-forwarded-host')).toBe('partial.example.com'); // auto-populated
            expect(request.getHeader('x-forwarded-port')).toBe('8080'); // auto-populated
        });

        it('should handle x-forwarded-* headers with comma-separated values', async () => {
            const body = '';
            const socket = new MockTLSSocket();
            const mockReq = {
                url: '/api/comma-test',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                    'x-forwarded-host': 'original-host.com, proxy1.com, proxy2.com',
                    'x-forwarded-proto': 'https, http',
                    'x-forwarded-port': '443, 80',
                    'x-forwarded-for': '10.0.0.1, 192.168.1.100',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from(body);
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            expect(request.host).toBe('original-host.com');
            expect(request.getHeader('x-forwarded-host')).toBe('original-host.com, proxy1.com, proxy2.com');
            expect(request.getHeader('x-forwarded-proto')).toBe('https, http');
            expect(request.getHeader('x-forwarded-port')).toBe('443, 80');
            expect(request.getHeader('x-forwarded-for')).toBe('10.0.0.1, 192.168.1.100');
        });

        it('should handle headers case insensitively from node request', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/test',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'X-API-Key': 'secret-key-123',
                    'user-agent': 'Mozilla/5.0',
                    Authorization: 'Bearer token123',
                    'x-custom-header': 'custom-value',
                    HOST: 'api.example.com',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('{"test": "data"}');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that headers can be accessed with different cases
            expect(request.getHeader('content-type')).toBe('application/json');
            expect(request.getHeader('Content-Type')).toBe('application/json');
            expect(request.getHeader('CONTENT-TYPE')).toBe('application/json');
            expect(request.getHeader('Content-type')).toBe('application/json');

            expect(request.getHeader('accept-encoding')).toBe('gzip, deflate');
            expect(request.getHeader('Accept-Encoding')).toBe('gzip, deflate');
            expect(request.getHeader('ACCEPT-ENCODING')).toBe('gzip, deflate');

            expect(request.getHeader('x-api-key')).toBe('secret-key-123');
            expect(request.getHeader('X-API-Key')).toBe('secret-key-123');
            expect(request.getHeader('X-API-KEY')).toBe('secret-key-123');
            expect(request.getHeader('x-Api-Key')).toBe('secret-key-123');

            expect(request.getHeader('user-agent')).toBe('Mozilla/5.0');
            expect(request.getHeader('User-Agent')).toBe('Mozilla/5.0');
            expect(request.getHeader('USER-AGENT')).toBe('Mozilla/5.0');

            expect(request.getHeader('authorization')).toBe('Bearer token123');
            expect(request.getHeader('Authorization')).toBe('Bearer token123');
            expect(request.getHeader('AUTHORIZATION')).toBe('Bearer token123');

            expect(request.getHeader('x-custom-header')).toBe('custom-value');
            expect(request.getHeader('X-Custom-Header')).toBe('custom-value');
            expect(request.getHeader('X-CUSTOM-HEADER')).toBe('custom-value');

            expect(request.getHeader('host')).toBe('api.example.com');
            expect(request.getHeader('Host')).toBe('api.example.com');
            expect(request.getHeader('HOST')).toBe('api.example.com');
        });

        it('should handle header arrays case insensitively from node request', async () => {
            const socket = new MockSocket();
            const mockReq = {
                url: '/api/test',
                method: 'GET',
                headers: {
                    'Set-Cookie': ['session=abc123', 'user=john'],
                    Accept: 'application/json',
                    'X-Custom': 'value1',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            // Manually set up the headers object to simulate multiple values
            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Manually add additional header values to test arrays
            request.addHeader('X-Custom', 'value2');
            request.addHeader('x-custom', 'value3');

            expect(request.getHeaderArray('set-cookie')).toEqual(['session=abc123', 'user=john']);
            expect(request.getHeaderArray('Set-Cookie')).toEqual(['session=abc123', 'user=john']);
            expect(request.getHeaderArray('SET-COOKIE')).toEqual(['session=abc123', 'user=john']);

            expect(request.getHeaderArray('accept')).toEqual(['application/json']);
            expect(request.getHeaderArray('Accept')).toEqual(['application/json']);
            expect(request.getHeaderArray('ACCEPT')).toEqual(['application/json']);

            // Test that adding headers with different cases still works correctly
            expect(request.getHeaderArray('x-custom').length).toBeGreaterThanOrEqual(2);
            expect(request.getHeaderArray('X-Custom').length).toBeGreaterThanOrEqual(2);
            expect(request.getHeaderArray('X-CUSTOM').length).toBeGreaterThanOrEqual(2);
        });

        it('should handle x-forwarded-* headers case insensitively from node request', async () => {
            const socket = new MockSocket();
            socket.remoteAddress = '10.0.0.1';
            const mockReq = {
                url: '/api/test',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                    'X-Forwarded-Proto': 'https',
                    'x-forwarded-host': 'original.example.com',
                    'X-FORWARDED-PORT': '8443',
                    'x-Forwarded-For': '203.0.113.1, 192.168.1.1',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test x-forwarded-proto with different cases
            expect(request.getHeader('x-forwarded-proto')).toBe('https');
            expect(request.getHeader('X-Forwarded-Proto')).toBe('https');
            expect(request.getHeader('X-FORWARDED-PROTO')).toBe('https');
            expect(request.getHeader('x-Forwarded-Proto')).toBe('https');

            // Test x-forwarded-host with different cases
            expect(request.getHeader('x-forwarded-host')).toBe('original.example.com');
            expect(request.getHeader('X-Forwarded-Host')).toBe('original.example.com');
            expect(request.getHeader('X-FORWARDED-HOST')).toBe('original.example.com');
            expect(request.getHeader('x-Forwarded-Host')).toBe('original.example.com');

            // Test x-forwarded-port with different cases
            expect(request.getHeader('x-forwarded-port')).toBe('8443');
            expect(request.getHeader('X-Forwarded-Port')).toBe('8443');
            expect(request.getHeader('X-FORWARDED-PORT')).toBe('8443');
            expect(request.getHeader('x-Forwarded-Port')).toBe('8443');

            // Test x-forwarded-for with different cases
            expect(request.getHeader('x-forwarded-for')).toBe('203.0.113.1, 192.168.1.1');
            expect(request.getHeader('X-Forwarded-For')).toBe('203.0.113.1, 192.168.1.1');
            expect(request.getHeader('X-FORWARDED-FOR')).toBe('203.0.113.1, 192.168.1.1');
            expect(request.getHeader('x-Forwarded-For')).toBe('203.0.113.1, 192.168.1.1');
        });

        it('should auto-populate missing x-own-recursion header to 0 in node request', async () => {
            const socket = new MockSocket();
            socket.remoteAddress = '10.0.0.1';
            const mockReq = {
                url: '/api/test',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                    // Missing x-own-recursion header
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that recursion counter is set to 0 when missing
            expect(request.getHeader(HEADERS.XOwnRecursions)).toBe('0');
        });

        it('should preserve existing x-own-recursion header in node request', async () => {
            const socket = new MockSocket();
            socket.remoteAddress = '10.0.0.1';
            const mockReq = {
                url: '/api/test',
                method: 'GET',
                headers: {
                    host: 'api.example.com',
                    [HEADERS.XOwnRecursions]: '5',
                },
                socket: socket,
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('');
                },
            };

            const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);

            // Test that existing recursion counter is preserved
            expect(request.getHeader(HEADERS.XOwnRecursions)).toBe('5');
        });
    });
});
