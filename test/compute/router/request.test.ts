import { Request } from '../../../src/compute/router/request.js';
import { EventEmitter } from 'events';
import { ProxyRequestEvent } from '../../../src/compute/router/proxyRequestEvent.js';
import http from 'http';

class MockSocket extends EventEmitter {
  encrypted = false;
  localPort = 8080;
}

class MockTLSSocket extends MockSocket {
  encrypted = true;
}

describe('Request', () => {
  describe('initialization', () => {
    it('should initialize with minimal valid options', () => {
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
          'Authorization': 'Bearer token123'
        }
      });
      
      expect(request.getHeader('content-type')).toBe('application/json');
      expect(request.getHeader('authorization')).toBe('Bearer token123');
    });
    
    it('should initialize with body', () => {
      const body = JSON.stringify({ test: 'data' });
      const request = new Request('http://example.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body
      });
      
      expect(request.body).toBe(body);
    });
    
    it('should initialize with params', () => {
      const request = new Request('http://example.com/users/:id', {
        method: 'GET',
        params: {
          id: '123'
        }
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
        'accept': 'application/json',
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
        'authorization': 'Bearer token'
      });
      
      expect(request.getHeader('content-type')).toBe('application/json');
      expect(request.getHeader('authorization')).toBe('Bearer token');
    });
    
    it('should add multiple headers at once', () => {
      const request = new Request('http://example.com');
      
      request.setHeader('accept', 'application/json');
      request.addHeaders({
        'accept': 'text/html',
        'x-custom': 'custom-value'
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
        'cookie': 'session=abc123; user=john; theme=dark',
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
        'cookie': 'multi=value1; multi=value2; single=value',
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
          'content-type': 'text/plain'
        },
        body: 'Plain text body'
      });
      
      expect(request.body).toBe('Plain text body');
    });
  });
  
  describe('fromEvent', () => {
    it('should create a request from raw proxy event', () => {
      // NOTE: This test is skipped because we can't easily mock the
      // isProxyRequestEvent function without importing jest.mock
      
      // In a real test environment, you would create a ProxyRequestEvent like this:
      const event: ProxyRequestEvent = {
        version: '2.0',
        headers: {
          'content-type': 'application/json',
          'host': 'api.example.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-port': '443'
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
            userAgent: 'test-agent'
          }
        },
        body: JSON.stringify({ test: 'data' }),
        isBase64Encoded: false
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
        // NOTE: This test is skipped because we can't easily mock the
        // isProxyRequestEvent function without importing jest.mock
        
        // In a real test environment, you would create a ProxyRequestEvent like this:
        const event: ProxyRequestEvent = {
          version: '2.0',
          headers: {
            'content-type': 'application/json',
            'host': 'api.example.com',
            'x-forwarded-proto': 'https',
            'x-forwarded-port': '443'
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
              userAgent: 'test-agent'
            }
          },
          body: Buffer.from(JSON.stringify({ test: 'data' })).toString('base64'),
          isBase64Encoded: true
        };
        
        // And test the created request properties
        const request = Request.fromEvent(event);
        expect(request.method).toBe('GET');
        expect(request.url.toString()).toBe('https://api.example.com/api/users?id=123');
        expect(request.getQuery('id')).toBe('123');
        expect(request.getHeader('content-type')).toBe('application/json');
        expect(request.body?.toString()).toEqual(JSON.stringify({ test: 'data' }));
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
          'host': 'example.com',
          'content-type': 'application/json'
        },
        socket: socket,
        // Make it an async iterable for body reading
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(body);
        }
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
          'host': 'secure.example.com'
        },
        socket: socket,
        // Empty body
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('');
        }
      };
      
      const request = await Request.fromNodeRequest(mockReq as unknown as http.IncomingMessage);
      
      // Test that it correctly identified this as HTTPS
      expect(request.protocol).toBe('https');
      expect(request.host).toBe('secure.example.com');
      expect(request.path).toBe('/secure');
      expect(request.url.protocol).toBe('https:');
    });
  });
  
  describe('AWS headers handling', () => {
    it('should delete AWS headers', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-amz-security-token': 'token123',
          'x-amzn-trace-id': 'trace123',
          'content-type': 'application/json'
        }
      });
      
      request.deleteAmznHeaders();
      
      expect(request.getHeader('x-amz-security-token')).toBeUndefined();
      expect(request.getHeader('x-amzn-trace-id')).toBeUndefined();
      expect(request.getHeader('content-type')).toBe('application/json');
    });
  });
}); 