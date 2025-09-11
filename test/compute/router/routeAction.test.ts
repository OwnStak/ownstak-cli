import { Router } from '../../../src/compute/router/router';
import { Request } from '../../../src/compute/router/request';
import { Response } from '../../../src/compute/router/response';
import { RequestContext } from '../../../src/compute/router/requestContex';
import http from 'http';
import { APP_PORT, ASSETS_PORT, HEADERS, PERMANENT_ASSETS_PORT } from '../../../src/constants';

describe('Router - Route Actions', () => {
    let router: Router;
    let request: Request;
    let response: Response;

    // Create a mock HTTP server
    let mockAssetsServer: http.Server;
    let mockPermanentAssetsServer: http.Server;
    let mockAppServer: http.Server;
    let mockServerUrl: string;

    beforeEach(() => {
        router = new Router();
        request = new Request('http://example.com/test');
        request.method = 'GET';
        request.headers = {};
        response = new Response();
    });

    beforeAll(async () => {
        const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
            if (req.url === '/proxy-test') {
                const host = req.headers.host;
                res.writeHead(200, { 'Content-Type': 'text/plain', 'x-proxy': 'proxied', ...req.headers });
                res.end(`Proxied content to host ${host}`);
            } else if (req.url === '/assets/image.png') {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end('Image content');
            } else if (req.url === '/permanent/image.png') {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end('Permanent image content');
            } else if (req.url === '/app') {
                res.writeHead(200, { 'Content-Type': 'text/html', 'x-app': 'served' });
                res.end('<html><body>App content</body></html>');
            } else if (req.url?.startsWith('/echo')) {
                const parsedUrl = new URL(req.url, 'http://localhost');
                const output = {
                    url: req.url,
                    path: parsedUrl.pathname,
                    headers: req.headers,
                };
                const outputJson = JSON.stringify(output, null, 2);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(outputJson);
            } else if (req.url === '/products/123/index.html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body>Product 123</body></html>');
            } else {
                res.writeHead(404);
                res.end();
            }
        };

        await Promise.all([
            new Promise((resolve) => (mockAssetsServer = http.createServer(handler).listen(ASSETS_PORT, () => resolve(true)))),
            new Promise((resolve) => (mockPermanentAssetsServer = http.createServer(handler).listen(PERMANENT_ASSETS_PORT, () => resolve(true)))),
            new Promise((resolve) => (mockAppServer = http.createServer(handler).listen(APP_PORT, () => resolve(true)))),
        ]);

        // Set mockServerUrl for proxy tests
        mockServerUrl = `http://127.0.0.1:${APP_PORT}`;
    });

    afterAll(async () => {
        await Promise.all([
            new Promise((resolve) => mockAssetsServer.close(() => resolve(true))),
            new Promise((resolve) => mockPermanentAssetsServer.close(() => resolve(true))),
            new Promise((resolve) => mockAppServer.close(() => resolve(true))),
        ]);
    });

    it('should execute setResponseHeader action', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-custom',
                value: 'custom-header-value',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-custom')).toBe('custom-header-value');
    });

    it('should execute setRequestHeader action', async () => {
        router.get('/test', [
            {
                type: 'setRequestHeader',
                key: 'x-custom-req',
                value: 'custom-req-value',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(request.getHeader('x-custom-req')).toBe('custom-req-value');
    });

    it('should execute setResponseStatus action', async () => {
        router.get('/test', [
            {
                type: 'setResponseStatus',
                statusCode: 418, // I'm a teapot
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(418);
    });

    it('should execute setResponseBody action', async () => {
        router.get('/test', [
            {
                type: 'setResponseBody',
                body: 'Custom response body content',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.body?.toString()).toBe('Custom response body content');
        expect(response.getHeader('content-length')).toBe('28');
        expect(response.getHeader('content-encoding')).toBeUndefined();
    });

    it('should execute setResponseBody action and override existing body', async () => {
        response.body = 'Existing body content';
        response.setHeader('content-length', '23');
        response.setHeader('content-encoding', 'gzip');

        router.get('/test', [
            {
                type: 'setResponseBody',
                body: 'Custom response body content',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.body?.toString()).toBe('Custom response body content');
        expect(response.getHeader('content-length')).toBe('28');
        expect(response.getHeader('content-encoding')).toBeUndefined();
    });

    it('should execute addResponseHeader action', async () => {
        response.setHeader('x-existing', 'value1');

        router.get('/test', [
            {
                type: 'addResponseHeader',
                key: 'x-existing',
                value: 'value2',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeaderArray('x-existing')).toEqual(['value1', 'value2']);
    });

    it('should execute deleteResponseHeader action', async () => {
        response.setHeader('x-to-delete', 'some-value');

        router.get('/test', [
            {
                type: 'deleteResponseHeader',
                key: 'x-to-delete',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-to-delete')).toBeUndefined();
    });

    it('should only set header if not already set with setDefaultResponseHeader', async () => {
        response.setHeader('x-existing', 'original-value');

        router.get('/test', [
            {
                type: 'setDefaultResponseHeader',
                key: 'x-existing',
                value: 'default-value',
            },
            {
                type: 'setDefaultResponseHeader',
                key: 'x-new-default',
                value: 'new-default-value',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-existing')).toBe('original-value');
        expect(response.getHeader('x-new-default')).toBe('new-default-value');
    });

    it('should not set header if already set with setDefaultResponseHeader', async () => {
        response.setHeader('x-existing', 'original-value');

        router.get('/test', [
            {
                type: 'setDefaultResponseHeader',
                key: 'x-existing',
                value: 'new-default-value',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-existing')).toBe('original-value');
    });

    it('should only set request header if not already set with setDefaultRequestHeader', async () => {
        request.setHeader('x-existing', 'original-value');

        router.get('/test', [
            {
                type: 'setDefaultRequestHeader',
                key: 'x-existing',
                value: 'default-value',
            },
            {
                type: 'setDefaultRequestHeader',
                key: 'x-new-default',
                value: 'new-default-value',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(request.getHeader('x-existing')).toBe('original-value');
        expect(request.getHeader('x-new-default')).toBe('new-default-value');
    });

    it('should not set request header if already set with setDefaultRequestHeader', async () => {
        request.setHeader('x-existing', 'original-value');

        router.get('/test', [
            {
                type: 'setDefaultRequestHeader',
                key: 'x-existing',
                value: 'new-default-value',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(request.getHeader('x-existing')).toBe('original-value');
    });

    it('should execute rewrite action with just destination', async () => {
        router.get('/test', [
            {
                type: 'rewrite',
                to: '/new-path',
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(request.path).toBe('/new-path');
    });

    it('should execute rewrite action with just simple string', async () => {
        router.get('/products/123', [
            {
                type: 'rewrite',
                from: '123',
                to: '456',
            },
        ]);

        const request = new Request(`http://example.com/products/123`);
        await router.execute(new RequestContext({ request, response }));
        expect(request.path).toBe('/products/456');
    });

    it('should execute rewrite action with regex params from source', async () => {
        router.get('/products/123', [
            {
                type: 'rewrite',
                from: /\/products\/(.+)$/,
                to: '/new/products/$1',
            },
        ]);

        const request = new Request(`http://example.com/products/123`);
        await router.execute(new RequestContext({ request, response }));
        expect(request.path).toBe('/new/products/123');
    });

    it('should execute rewrite action with path-to-regex params from source', async () => {
        router.get('/products/123', [
            {
                type: 'rewrite',
                from: '/products/:id',
                to: '/new/products/:id',
            },
        ]);

        const request = new Request(`http://example.com/products/123`);
        await router.execute(new RequestContext({ request, response }));
        expect(request.path).toBe('/new/products/123');
    });

    it('should execute proxy action', async () => {
        router.get('/proxy-test', [
            {
                type: 'proxy',
                url: mockServerUrl,
            },
        ]);

        const request = new Request(`http://example.com/proxy-test`);
        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-proxy')).toBe('proxied');
    });

    it('should execute proxy action with preserveHostHeader', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath`,
                preserveHostHeader: true,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath`, {
            headers: {
                host: 'example.com',
            },
        });
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.headers['host']).toBe('example.com');
    });

    it('should execute proxy action without preserveHostHeader', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath`,
                preserveHostHeader: false,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath`, {
            headers: {
                host: 'example.com',
            },
        });
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.headers['host']).toBe('127.0.0.1');
    });

    it('should execute proxy action with preserveHeaders', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath`,
                preserveHeaders: true,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath`, {
            headers: {
                'x-req-header': 'true',
            },
        });
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.headers['x-req-header']).toBe('true');
    });

    it('should execute proxy action without preserveHeaders', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath`,
                preserveHeaders: false,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath`, {
            headers: {
                'x-req-header': 'true',
            },
        });
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.headers['x-req-header']).toBeUndefined();
    });

    it('should execute proxy action with preservePath', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath`,
                preservePath: true,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath`);
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.path).toBe('/echo/requestPath');
    });

    it('should execute proxy action without preservePath', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath`,
                preservePath: false,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath`);
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.path).toBe('/echo/proxyPath');
    });

    it('should execute proxy action with preserveQuery', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath?proxyQuery=value`,
                preserveQuery: true,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath?requestQuery=value`);
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.url).toBe('/echo/requestPath?requestQuery=value');
    });

    it('should execute proxy action with preserveQuery', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath?proxyQuery=value`,
                preserveQuery: false,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath?requestQuery=value`);
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.url).toBe('/echo/requestPath?proxyQuery=value');
    });

    it('should execute proxy action and do not add any query', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath?`,
                preserveQuery: false,
            },
        ]);

        const request = new Request(`http://example.com/echo/requestPath?requestQuery=value`);
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.url).toBe('/echo/requestPath');
    });

    it('should execute proxy action and remove double slashes', async () => {
        router.any([
            {
                type: 'proxy',
                url: `${mockServerUrl}/echo/proxyPath?`,
                preserveQuery: false,
            },
        ]);

        const request = new Request(`http://example.com/echo//requestPath//another`);
        const response = new Response();

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('application/json');
        const echoOutput = JSON.parse(response.body?.toString() || '{}');
        expect(echoOutput.url).toBe('/echo/requestPath/another');
    });

    it('should execute serveAsset action with proxy locally', async () => {
        router.get('/test', [
            {
                type: 'serveAsset',
                path: '/assets/image.png',
            },
        ]);

        const request = new Request(`http://example.com/test`);
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('image/png');
        expect(response.body?.toString()).toBe('Image content');
    });

    it('should execute servePermanentAsset action with proxy locally', async () => {
        router.get('/test', [
            {
                type: 'servePermanentAsset',
                path: '/permanent/image.png',
            },
        ]);

        const request = new Request(`http://example.com/test`);
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('image/png');
        expect(response.body?.toString()).toBe('Permanent image content');
    });

    it('should execute servePermanentAsset action with follow-redirect behind proxy', async () => {
        router.get('/test', [
            {
                type: 'servePermanentAsset',
                path: '/permanent/image.png',
            },
        ]);
        const request = new Request(`http://example.com/test`, {
            headers: {
                [HEADERS.XOwnProxy]: 'true',
                [HEADERS.XOwnProxyVersion]: '0.1.1',
            },
        });
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(200);
        expect(response.getHeader('location')).toBe(`http://0.0.0.0:3003/permanent/image.png`);
        expect(response.getHeader(HEADERS.XOwnFollowRedirect)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeStatus)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeHeaders)).toBe('true');
    });

    it('should execute serveAsset action with follow-redirect behind proxy', async () => {
        router.get('/test', [
            {
                type: 'serveAsset',
                path: '/assets/image.png',
            },
        ]);
        const request = new Request(`http://example.com/test`, {
            headers: {
                [HEADERS.XOwnProxy]: 'true',
                [HEADERS.XOwnProxyVersion]: '0.1.1',
            },
        });
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(200);
        expect(response.getHeader('location')).toBe(`http://0.0.0.0:3002/assets/image.png`);
        expect(response.getHeader(HEADERS.XOwnFollowRedirect)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeStatus)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeHeaders)).toBe('true');
    });

    it('should execute serveAsset action behind proxy and preserve custom status code', async () => {
        router.get('/test', [
            {
                type: 'setResponseStatus',
                statusCode: 404,
            },
            {
                type: 'serveAsset',
                path: '/assets/404.html',
            },
        ]);
        const request = new Request(`http://example.com/test`, {
            headers: {
                [HEADERS.XOwnProxy]: 'true',
                [HEADERS.XOwnProxyVersion]: '0.1.1',
            },
        });
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(404);
        expect(response.getHeader('location')).toBe(`http://0.0.0.0:3002/assets/404.html`);
        expect(response.getHeader(HEADERS.XOwnFollowRedirect)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeStatus)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeHeaders)).toBe('true');
    });

    it('should execute serveAsset action behind proxy and and override status code', async () => {
        router.get('/test', [
            {
                type: 'setResponseStatus',
                statusCode: 404,
            },
            {
                type: 'serveAsset',
                path: '/assets/404.html',
            },
            {
                type: 'setResponseStatus',
                statusCode: 418,
            },
        ]);
        const request = new Request(`http://example.com/test`, {
            headers: {
                [HEADERS.XOwnProxy]: 'true',
                [HEADERS.XOwnProxyVersion]: '0.1.1',
            },
        });
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(418);
        expect(response.getHeader('location')).toBe(`http://0.0.0.0:3002/assets/404.html`);
        expect(response.getHeader(HEADERS.XOwnFollowRedirect)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeStatus)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeHeaders)).toBe('true');
    });

    it('should execute serveAsset action and remove double slashes locally', async () => {
        router.get('/test', [
            {
                type: 'serveAsset',
                path: '/assets//image.png',
            },
        ]);

        const request = new Request(`http://example.com/test`);
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('image/png');
        expect(response.body?.toString()).toBe('Image content');
    });

    it('should execute serveAsset action and remove double slashes behind proxy', async () => {
        router.get('/test', [
            {
                type: 'serveAsset',
                path: '/asset//image.png',
            },
        ]);
        const request = new Request(`http://example.com/test`, {
            headers: {
                [HEADERS.XOwnProxy]: 'true',
                [HEADERS.XOwnProxyVersion]: '0.1.1',
            },
        });
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(200);
        expect(response.getHeader('location')).toBe(`http://0.0.0.0:3002/asset/image.png`);
        expect(response.getHeader(HEADERS.XOwnFollowRedirect)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeStatus)).toBe('true');
        expect(response.getHeader(HEADERS.XOwnMergeHeaders)).toBe('true');
    });

    it('should execute serveAsset action and add index.html for paths without file extension', async () => {
        router.get('/products/123', [
            {
                type: 'serveAsset',
            },
        ]);

        const request = new Request(`http://example.com/products/123`);
        const response = new Response();
        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('content-type')).toBe('text/html');
        expect(response.body?.toString()).toBe('<html><body>Product 123</body></html>');
    });

    it('should execute serveApp action', async () => {
        router.get('/app', [
            {
                type: 'serveApp',
            },
        ]);

        // Simulate serving the app
        request.path = '/app';

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-app')).toBe('served');
        expect(response.body?.toString()).toContain('App content');
    });

    it('should execute redirect action', async () => {
        router.get('/test', [
            {
                type: 'redirect',
                to: 'http://redirect.example.com',
                statusCode: 302,
            },
        ]);

        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(302);
        expect(response.getHeader('location')).toBe('http://redirect.example.com');
    });

    it('should execute echo action', async () => {
        router.get('/echo', [
            {
                type: 'echo',
            },
        ]);

        request.path = '/echo';

        // Mock echo behavior
        const response = new Response('', {
            headers: {
                'x-echo': 'echoed',
            },
        });

        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader('x-echo')).toBe('echoed');
    });

    it('should execute imageOptimizer action', async () => {
        router.match('/__ownstak__/image', [
            {
                type: 'imageOptimizer',
            },
        ]);
        const request = new Request(`${mockServerUrl}/__ownstak__/image?url=/assets/image.png`);
        request.setHeader(HEADERS.XOwnDebug, 'true');
        await router.execute(new RequestContext({ request, response }));
        expect(response.getHeader(HEADERS.XOwnActions)).toBe('imageOptimizer');
    });

    it('should execute healthCheck action', async () => {
        router.match('/__ownstak__/project/health', [
            {
                type: 'healthCheck',
            },
        ]);
        const request = new Request(`${mockServerUrl}/__ownstak__/project/health`);
        await router.execute(new RequestContext({ request, response }));
        expect(response.statusCode).toBe(200);
        expect(response.body?.toString()).toBe('OK');
    });
});
