import { RequestContext } from '../../../src/compute/router/requestContex.js';
import { Request } from '../../../src/compute/router/request.js';
import { Response } from '../../../src/compute/router/response.js';
import { Config } from '../../../src/config.js';
import { jest } from '@jest/globals';

describe('RequestContext', () => {
    let context: RequestContext;

    describe('initialization', () => {
        it('should initialize with default values', () => {
            context = new RequestContext();

            expect(context.request).toBeInstanceOf(Request);
            expect(context.response).toBeInstanceOf(Response);
            expect(context.config).toBeInstanceOf(Config);
        });

        it('should initialize with provided options', () => {
            const request = new Request();
            const response = new Response();
            const config = new Config();

            context = new RequestContext({ request, response, config });

            expect(context.request).toBe(request);
            expect(context.response).toBe(response);
            expect(context.config).toBe(config);
        });
    });

    describe('compression setup', () => {
        it('should set compression when enabled in config with accept-encoding header', () => {
            const request = new Request();
            const response = new Response();
            const config = new Config();

            config.app = { compression: true } as any;
            request.setHeader('accept-encoding', 'gzip, br');

            context = new RequestContext({ request, response, config });
            expect(response.outputCompression).toBe('br');
        });

        it('should not set compression when disabled in config', () => {
            const request = new Request();
            const response = new Response();
            const config = new Config();

            config.app = { compression: false } as any;
            request.setHeader('accept-encoding', 'gzip, br');

            context = new RequestContext({ request, response, config });
            expect(response.outputCompression).toBeUndefined();
        });

        it('should not set compression when there is no accept-encoding header', () => {
            const request = new Request();
            const response = new Response();
            const config = new Config();

            config.app = { compression: true } as any;
            context = new RequestContext({ request, response, config });
            expect(response.outputCompression).toBeUndefined();
        });
    });

    describe('handleError', () => {
        beforeEach(() => {
            context = new RequestContext();
        });

        it('should convert error to ProjectError and return JSON response', () => {
            const request = new Request();
            const response = new Response();
            const config = new Config();

            context = new RequestContext({ request, response, config });

            const error = new Error('Test error');
            const result = context.handleError(error);

            expect(result).toBeInstanceOf(Response);
            expect(result.statusCode).toBe(540);
            expect(JSON.parse(result.body.toString())).toEqual({
                errorMessage: 'Test error',
                errorStatus: 540,
                errorTitle: 'Project Error',
                component: 'OwnStak CLI v0.0.0',
            });
        });

        it('should convert error to ProjectError and return HTML response', () => {
            const request = new Request();
            request.setHeader('accept', 'text/html');

            const response = new Response();
            const config = new Config();

            context = new RequestContext({ request, response, config });

            const error = new Error('Test error');
            const result = context.handleError(error);

            expect(result).toBeInstanceOf(Response);
            expect(result.statusCode).toBe(540);
            expect(result.body.toString()).toContain('Test error');
            expect(result.body.toString()).toContain('Project Error');
            expect(result.body.toString()).toContain('OwnStak CLI v0.0.0');
        });

        it('should contain requestId if provided', () => {
            const request = new Request();
            request.setHeader('x-request-id', 'test-123');

            const response = new Response();
            const config = new Config();

            context = new RequestContext({ request, response, config });

            const error = new Error('Test error');
            const result = context.handleError(error);

            expect(result.body.toString()).toContain('test-123');
        });

        it('should contain CLI version if provided', () => {
            const request = new Request();
            const response = new Response();
            const config = new Config();
            config.cliVersion = '1.0.0';
            context = new RequestContext({ request, response, config });

            const error = new Error('Test error');
            const result = context.handleError(error);

            expect(result.body.toString()).toContain('1.0.0');
        });
    });
});
