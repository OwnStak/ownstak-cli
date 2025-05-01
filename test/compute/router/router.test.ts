import { Router } from '../../../src/compute/router/router';
import { Request } from '../../../src/compute/router/request';
import { Response } from '../../../src/compute/router/response';

describe('Router - Route Matching', () => {
    let router: Router;
    let request: Request;
    let response: Response;

    beforeEach(() => {
        router = new Router();
        request = new Request('http://example.com/test', {
            method: 'GET',
        });
        response = new Response();
    });

    it('should match a simple path condition', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-test',
                value: 'test-value',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-test')).toBe('test-value');
    });

    it('should match a regex path condition', async () => {
        router.match({ path: /^\/test/, method: 'GET' }, [
            {
                type: 'setResponseHeader',
                key: 'x-test',
                value: 'regex-test',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-test')).toBe('regex-test');
    });

    it('should match a path-to-regex pattern', async () => {
        router.get('/test/:id', [
            {
                type: 'setResponseHeader',
                key: 'x-test-id',
                value: 'path-to-regex',
            },
        ]);

        const patternRequest = new Request('http://example.com/test/123');
        await router.execute(patternRequest, response);

        expect(response.getHeader('x-test-id')).toBe('path-to-regex');
        expect(patternRequest.params).toEqual({ id: '123' });
    });

    it('should match a path-to-regex pattern with optional param', async () => {
        router.get('/test/:id?', [
            {
                type: 'setResponseHeader',
                key: 'x-test-id',
                value: 'path-to-regex',
            },
        ]);

        const patternRequest = new Request('http://example.com/test/123');
        await router.execute(patternRequest, response);

        expect(response.getHeader('x-test-id')).toBe('path-to-regex');
        expect(patternRequest.params).toEqual({ id: '123' });
    });

    it('should match a path-to-regex pattern with catch all', async () => {
        router.get('/test/:id*', [
            {
                type: 'setResponseHeader',
                key: 'x-test-id',
                value: 'path-to-regex',
            },
        ]);

        const patternRequest = new Request('http://example.com/test/123/456');
        await router.execute(patternRequest, response);

        expect(response.getHeader('x-test-id')).toBe('path-to-regex');
        expect(patternRequest.params).toEqual({ id: ['123', '456'] });
    });

    it('should match any value in array of paths', async () => {
        router.get({
            path: ['/test/123', '/test/456'],
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-test',
                value: 'array-of-paths',
            },
        ]);

        const patternRequest = new Request('http://example.com/test/123');
        const patternResponse = new Response();
        await router.execute(patternRequest, patternResponse);
        expect(patternResponse.getHeader('x-test')).toBe('array-of-paths');

        const patternRequest2 = new Request('http://example.com/test/456');
        const patternResponse2 = new Response();
        await router.execute(patternRequest2, patternResponse2);
        expect(patternResponse2.getHeader('x-test')).toBe('array-of-paths');

        const patternRequest3 = new Request('http://example.com/test/789');
        const patternResponse3 = new Response();
        await router.execute(patternRequest3, patternResponse3);
        expect(patternResponse3.getHeader('x-test')).toBeUndefined();
    });

    it('should match GET method', async () => {
        router.get({}, [
            {
                type: 'setResponseHeader',
                key: 'x-method',
                value: 'GET',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-method')).toBe('GET');
    });

    it('should match POST method', async () => {
        router.post({}, [
            {
                type: 'setResponseHeader',
                key: 'x-method',
                value: 'POST',
            },
        ]);

        const postRequest = new Request('http://example.com/test');
        postRequest.method = 'POST';
        postRequest.headers = {};

        await router.execute(postRequest, response);
        expect(response.getHeader('x-method')).toBe('POST');
    });

    it('should match any method with route.match', async () => {
        router.match({}, [
            {
                type: 'setResponseHeader',
                key: 'x-matched',
                value: 'any-method',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-matched')).toBe('any-method');
    });

    it('should match a request with specific header', async () => {
        router.get({
            header: {
                'x-custom-header': 'custom-value',
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'header-matched',
            },
        ]);

        const headerRequest = new Request('http://example.com/test');
        headerRequest.method = 'GET';
        headerRequest.headers = {
            'x-custom-header': 'custom-value',
        };

        await router.execute(headerRequest, response);
        expect(response.getHeader('x-match-result')).toBe('header-matched');
    });

    it('should match a request with specific cookie', async () => {
        router.get({
            cookie: {
                'session': 'abc123',
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'cookie-matched',
            },
        ]);

        const cookieRequest = new Request('http://example.com/test');
        cookieRequest.method = 'GET';
        cookieRequest.headers = {
            'cookie': 'session=abc123',
        };

        await router.execute(cookieRequest, response);
        expect(response.getHeader('x-match-result')).toBe('cookie-matched');
    });

    it('should match a request with specific query parameter', async () => {
        router.get({
            query: {
                'id': '123',
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'query-matched',
            },
        ]);

        const queryRequest = new Request('http://example.com/test?id=123');
        queryRequest.method = 'GET';

        await router.execute(queryRequest, response);
        expect(response.getHeader('x-match-result')).toBe('query-matched');
    });

    it('should match a request with specific path extension', async () => {
        router.get({
            pathExtension: 'html',
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'path-extension-matched',
            },
        ]);

        const pathExtensionRequest = new Request('http://example.com/test.html');
        pathExtensionRequest.method = 'GET';

        await router.execute(pathExtensionRequest, response);
        expect(response.getHeader('x-match-result')).toBe('path-extension-matched');
    });

    it('should match a request with multiple conditions', async () => {
        router.get({
            path: '/test',
            method: 'GET',
            header: {
                'x-custom-header': 'custom-value',
            },
            query: {
                'id': '123',
            },
            cookie: {
                'session': 'abc123',
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'multi-condition-matched',
            },
        ]);

        const multiConditionRequest = new Request('http://example.com/test?id=123');
        multiConditionRequest.method = 'GET';
        multiConditionRequest.headers = {
            'x-custom-header': 'custom-value',
            'cookie': 'session=abc123',
        };

        await router.execute(multiConditionRequest, response);
        expect(response.getHeader('x-match-result')).toBe('multi-condition-matched');
    });

    it('should match a request with specific URL', async () => {
        router.get({
            url: 'http://example.com/test',
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'url-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBe('url-matched');
    });

    it('should match a request with URL regex', async () => {
        router.get({
            url: /http:\/\/example\.com\/test/,
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'url-regex-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBe('url-regex-matched');
    });

    it('should not match a request with negated URL', async () => {
        router.get({
            url: { not: 'http://example.com/test' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'negated-url-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should match a request with path regex', async () => {
        router.get({
            path: /^\/test/,
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'path-regex-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBe('path-regex-matched');
    });

    it('should not match a request with negated path', async () => {
        router.get({
            path: { not: '/test' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'path-not-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should match a request with path extension regex', async () => {
        router.get({
            pathExtension: /html|htm/,
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'path-extension-regex-matched',
            },
        ]);

        const pathExtensionRequest = new Request('http://example.com/test.html');
        pathExtensionRequest.method = 'GET';

        await router.execute(pathExtensionRequest, response);
        expect(response.getHeader('x-match-result')).toBe('path-extension-regex-matched');
    });

    it('should not match a request with negated path extension', async () => {
        router.get({
            pathExtension: { not: 'html' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'path-extension-not-matched',
            },
        ]);

        const pathExtensionRequest = new Request('http://example.com/test.html');
        pathExtensionRequest.method = 'GET';

        await router.execute(pathExtensionRequest, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should match a request with method regex', async () => {
        router.match({
            method: /GET|POST/,
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'method-regex-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBe('method-regex-matched');
    });

    it('should not match a request with negated method', async () => {
        router.match({
            method: { not: 'GET' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'method-not-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should match a request with cookie regex', async () => {
        router.get({
            cookie: {
                'session': /abc\d+/,  // Matches abc followed by digits
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'cookie-regex-matched',
            },
        ]);

        const cookieRequest = new Request('http://example.com/test');
        cookieRequest.method = 'GET';
        cookieRequest.headers = {
            'cookie': 'session=abc123',
        };

        await router.execute(cookieRequest, response);
        expect(response.getHeader('x-match-result')).toBe('cookie-regex-matched');
    });

    it('should match a request with header regex', async () => {
        router.get({
            header: {
                'x-custom-header': /custom-.+/,  // Matches custom- followed by any characters
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'header-regex-matched',
            },
        ]);

        const headerRequest = new Request('http://example.com/test');
        headerRequest.method = 'GET';
        headerRequest.headers = {
            'x-custom-header': 'custom-value',
        };

        await router.execute(headerRequest, response);
        expect(response.getHeader('x-match-result')).toBe('header-regex-matched');
    });

    it('should match a request with query regex', async () => {
        router.get({
            query: {
                'id': /\d+/,  // Matches digits
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'query-regex-matched',
            },
        ]);

        const queryRequest = new Request('http://example.com/test?id=123');
        queryRequest.method = 'GET';

        await router.execute(queryRequest, response);
        expect(response.getHeader('x-match-result')).toBe('query-regex-matched');
    });

    it('should match a request with complex condition (AND logic)', async () => {
        router.match({
            url: /http:\/\/example\.com\/test/,
            path: '/test',
            method: 'GET',
            header: {
                'x-custom-header': 'custom-value',
            },
            query: {
                'id': '123',
            },
            cookie: {
                'session': 'abc123',
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'complex-condition-matched',
            },
        ]);

        const complexRequest = new Request('http://example.com/test?id=123');
        complexRequest.method = 'GET';
        complexRequest.headers = {
            'x-custom-header': 'custom-value',
            'cookie': 'session=abc123',
        };

        await router.execute(complexRequest, response);
        expect(response.getHeader('x-match-result')).toBe('complex-condition-matched');
    });

    it('should match a request with array condition (OR logic)', async () => {
        router.match({
            method: ['GET', 'POST'],
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'array-condition-matched',
            },
        ]);

        const getRequest = new Request('http://example.com/test', {
            method: 'GET',
        });
        await router.execute(getRequest, response);
        expect(response.getHeader('x-match-result')).toBe('array-condition-matched');

        const postRequest = new Request('http://example.com/test', {
            method: 'POST',
        });
        await router.execute(postRequest, response);
        expect(response.getHeader('x-match-result')).toBe('array-condition-matched');
    });
    
    it('should not match a request with negated URL condition', async () => {
        router.match({
            url: { not: 'http://example.com/test' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'negated-url-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should not match a request with negated path condition', async () => {
        router.match({
            path: { not: '/test' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'negated-path-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should not match a request with negated method condition', async () => {
        router.match({
            method: { not: 'GET' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-match-result',
                value: 'negated-method-matched',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-match-result')).toBeUndefined();
    });

    it('should stop execution when a route with done: true is matched', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-first',
                value: 'first-header',
            },
        ], true); // This route has done: true

        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-second',
                value: 'second-header',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-first')).toBe('first-header');
        expect(response.getHeader('x-second')).toBeUndefined();
    });

    it('should continue execution when a route with done: false is matched', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-first',
                value: 'first-header',
            },
        ], false); // This route has done: false

        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-second',
                value: 'second-header',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-first')).toBe('first-header');
        expect(response.getHeader('x-second')).toBe('second-header');
    });

    it('should execute routes based on order of definition', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-priority',
                value: 'first',
            },
        ]);

        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-priority',
                value: 'second',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-priority')).toBe('second');
    });

    it('should execute multiple actions for a single route', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-first',
                value: 'first-action',
            },
            {
                type: 'setResponseHeader',
                key: 'x-second',
                value: 'second-action',
            },
        ]);

        await router.execute(request, response);
        expect(response.getHeader('x-first')).toBe('first-action');
        expect(response.getHeader('x-second')).toBe('second-action');
    });

    it('should handle complex conditions with multiple criteria', async () => {
        router.get({
            path: '/test',
            method: 'GET',
            header: {
                'x-custom-header': 'custom-value',
            },
            query: {
                'id': '123',
            },
            cookie: {
                'session': 'abc123',
            },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-complex',
                value: 'complex-condition',
            },
        ]);

        const complexRequest = new Request('http://example.com/test?id=123');
        complexRequest.method = 'GET';
        complexRequest.headers = {
            'x-custom-header': 'custom-value',
            'cookie': 'session=abc123',
        };

        await router.execute(complexRequest, response);
        expect(response.getHeader('x-complex')).toBe('complex-condition');
    });

    it('should handle negated conditions correctly', async () => {
        router.get({
            path: { not: '/test' },
        }, [
            {
                type: 'setResponseHeader',
                key: 'x-negated',
                value: 'negated-condition',
            },
        ]);

        const negatedRequest = new Request('http://example.com/other');
        negatedRequest.method = 'GET';

        await router.execute(negatedRequest, response);
        expect(response.getHeader('x-negated')).toBe('negated-condition');
    });

    it('should handle edge cases with empty routes', async () => {
        router.get('', [
            {
                type: 'setResponseHeader',
                key: 'x-empty',
                value: 'empty-route',
            },
        ]);

        const emptyRequest = new Request('http://example.com');
        emptyRequest.method = 'GET';

        await router.execute(emptyRequest, response);
        expect(response.getHeader('x-empty')).toBe('empty-route');
    });

    it('should handle unsupported methods gracefully', async () => {
        router.get('/test', [
            {
                type: 'setResponseHeader',
                key: 'x-unsupported',
                value: 'unsupported-method',
            },
        ]);

        const unsupportedRequest = new Request('http://example.com/test');
        unsupportedRequest.method = 'PUT';

        await router.execute(unsupportedRequest, response);
        expect(response.getHeader('x-unsupported')).toBeUndefined();
    });

    it('should add a route to the back of router using addRoute', async () => {
        router.addRoute({ path: '/' }, [
            {
                type: 'setResponseHeader',
                key: 'x-route-order',
                value: '1',
            }
        ]);
        router.addRoute({ path: '/' }, [
            {
                type: 'setResponseHeader',
                key: 'x-route-order',
                value: '2',
            }
        ]);

        const addRouteRequest = new Request('http://example.com');
        addRouteRequest.method = 'GET';

        await router.execute(addRouteRequest, response);
        expect(response.getHeader('x-route-order')).toBe('2');
    });


    it('should add a route to the front of router using addRoute', async () => {
        router.addRoute({ path: '/' }, [
            {
                type: 'setResponseHeader',
                key: 'x-route-order',
                value: '1',
            },
        ]);
        router.addRouteFront({ path: '/' }, [
            {
                type: 'setResponseHeader',
                key: 'x-route-order',
                value: '2',
            },
        ]);

        const addRouteRequest = new Request('http://example.com');
        addRouteRequest.method = 'GET';

        await router.execute(addRouteRequest, response);
        expect(response.getHeader('x-route-order')).toBe('1');
    });

        it('should match path with and without trailing slash for string paths', async () => {
        router.addRoute({ path: '/test' }, [
            {
                type: 'setResponseHeader',
                key: 'x-matched',
                value: 'test',
            },
        ]);

        const request = new Request('http://example.com/test');
        const response = new Response();
        await router.execute(request, response);
        expect(response.getHeader('x-matched')).toBe('test');

        const request2 = new Request('http://example.com/test/');
        const response2 = new Response();
        await router.execute(request2, response2);
        expect(response2.getHeader('x-matched')).toBe('test');
    });

    it('should match path exactly for regex paths', async () => {
        router.addRoute({ path: /^\/test$/ }, [
            {
                type: 'setResponseHeader',
                key: 'x-matched',
                value: 'test',
            },
        ]);

        const request = new Request('http://example.com/test');
        const response = new Response();
        await router.execute(request, response);
        expect(response.getHeader('x-matched')).toBe('test');

        const request2 = new Request('http://example.com/test/');
        const response2 = new Response();
        await router.execute(request2, response2);
        expect(response2.getHeader('x-matched')).toBeUndefined();
    });
}); 