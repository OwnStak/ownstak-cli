import { Router } from '../../../src/compute/router/router';
import { Request } from '../../../src/compute/router/request';
import { Response } from '../../../src/compute/router/response';
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
            } else if (req.url === '/persistent/image.png') {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end('Persistent image content');
            } else if (req.url === '/app') {
                res.writeHead(200, { 'Content-Type': 'text/html', 'x-app': 'served' });
                res.end('<html><body>App content</body></html>');
            } else {
                res.writeHead(404);
                res.end();
            }
        }

        await Promise.all([
            new Promise((resolve) => mockAssetsServer = http.createServer(handler).listen(ASSETS_PORT, () => resolve(true))),
            new Promise((resolve) => mockPermanentAssetsServer = http.createServer(handler).listen(PERMANENT_ASSETS_PORT, () => resolve(true))),
            new Promise((resolve) => mockAppServer = http.createServer(handler).listen(APP_PORT, () => resolve(true))),
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

        await router.execute(request, response);
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

        await router.execute(request, response);
        expect(request.getHeader('x-custom-req')).toBe('custom-req-value');
    });

    it('should execute setResponseStatus action', async () => {
        router.get('/test', [
            {
                type: 'setResponseStatus',
                statusCode: 418, // I'm a teapot
            },
        ]);

        await router.execute(request, response);
        expect(response.statusCode).toBe(418);
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

        await router.execute(request, response);
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

        await router.execute(request, response);
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

        await router.execute(request, response);
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

        await router.execute(request, response);
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

        await router.execute(request, response);
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

        await router.execute(request, response);
        expect(request.getHeader('x-existing')).toBe('original-value');
    });
    
    it('should execute rewrite action', async () => {
        router.get('/test', [
            {
                type: 'rewrite',
                from: '/test',
                to: '/new-path',
            },
        ]);

        await router.execute(request, response);
        expect(request.path).toBe('/new-path');
    });

    it('should execute proxy action', async () => {
        router.get('/proxy-test', [
            {
                type: 'proxy',
                url: mockServerUrl
            },
        ]);


        const request = new Request(`http://example.com/proxy-test`);
        await router.execute(request, response);
        expect(response.getHeader('x-proxy')).toBe('proxied');
    });

    it('should execute proxy action without preserveHostHeader', async () => {
        router.get('/proxy-test', [
            {
                type: 'proxy',
                url: mockServerUrl,
                preserveHostHeader: false,
            },
        ]);


        const request = new Request(`http://example.com/proxy-test`);
        await router.execute(request, response);
        expect(response.getHeader('x-proxy')).toBe('proxied');
        expect(response.body?.toString()).toBe('Proxied content to host 127.0.0.1');
    });

    it('should execute proxy action with preserveHostHeader', async () => {
        router.get('/proxy-test', [
            {
                type: 'proxy',
                url: mockServerUrl,
                preserveHostHeader: true,
            },
        ]);

        const request = new Request(`http://example.com/proxy-test`);
        await router.execute(request, response);
        expect(response.getHeader('x-proxy')).toBe('proxied');
        expect(response.body?.toString()).toBe('Proxied content to host example.com');
    });

    it('should execute proxy action with preserveHeaders', async () => {
        router.get('/proxy-test', [
            {
                type: 'proxy',
                url: mockServerUrl,
                preserveHeaders: true,
            },
        ]);

        const request = new Request(`http://example.com/proxy-test`, {
            headers: {
                'x-custom-header': 'custom-header-value',
            },
        });
        await router.execute(request, response);
        expect(response.getHeader('x-proxy')).toBe('proxied');
        expect(response.body?.toString()).toBe('Proxied content to host example.com');
        expect(response.getHeader('x-custom-header')).toBe('custom-header-value');
    });

    it('should execute proxy action without preserveHeaders', async () => {
        router.get('/proxy-test', [
            {
                type: 'proxy',
                url: mockServerUrl,
                preserveHeaders: false,
            },
        ]);

        const request = new Request(`http://example.com/proxy-test`, {
            headers: {
                'x-custom-header': 'custom-header-value',
            },
        });
        await router.execute(request, response);
        expect(response.getHeader('x-proxy')).toBe('proxied');
        expect(response.body?.toString()).toBe('Proxied content to host example.com');
        expect(response.getHeader('x-custom-header')).toBeUndefined();
    });

    it('should execute serveAsset action', async () => {
        router.get('/test', [
            {
                type: 'serveAsset',
                path: '/assets/image.png',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('content-type')).toBe('image/png');
        expect(response.body?.toString()).toBe('Image content');
    });

    it('should execute servePersistentAsset action', async () => {
        router.get('/test', [
            {
                type: 'servePersistentAsset',
                path: '/persistent/image.png'
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('content-type')).toBe('image/png');
        expect(response.body?.toString()).toBe('Persistent image content');
    });

    it('should execute serveApp action', async () => {
        router.get('/app', [
            {
                type: 'serveApp'
            },
        ]);

        // Simulate serving the app
        request.path = '/app';

        await router.execute(request, response);
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

        await router.execute(request, response);
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
        const echoResponse = new Response();
        echoResponse.setHeader('x-echo', 'echoed');

        await router.execute(request, echoResponse);
        expect(echoResponse.getHeader('x-echo')).toBe('echoed');
    });

    it('should execute imageOptimizer action', async () => {
        router.match("/__ownstak__/image", [
            {
                type: 'imageOptimizer',
            },
        ]);
        const request = new Request(`${mockServerUrl}/__ownstak__/image?url=/assets/image.png`);
        await router.execute(request, response);
        expect(response.getHeader(HEADERS.XOwnImageOptimizer)).toBeDefined();
    });
}); 