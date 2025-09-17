import { Config, ConfigOptions } from '../src/config';
import { Router } from '../src/compute/router/router';
import { CliError } from '../src/cliError';

describe('Config', () => {
    it('should initialize with default values', () => {
        const config = new Config();

        expect(config.cliVersion).toBeDefined();
        expect(config.environment).toBeDefined();
        expect(config.runtime).toBeDefined();
        expect(config.memory).toBe(1024);
        expect(config.arch).toBeDefined();
        expect(config.timeout).toBe(20);
        expect(config.router).toBeInstanceOf(Router);
        expect(config.buildCommand).toBeUndefined();
        expect(config.devCommand).toBeUndefined();
        expect(config.skipFrameworkBuild).toBeUndefined();
        expect(config.frameworkAdapter).toBeUndefined();
        expect(config.framework).toBeUndefined();
        expect(config.organization).toBeUndefined();
        expect(config.project).toBeUndefined();
        expect(config.environment).toBe('default');

        expect(config.assets.include).toEqual({});
        expect(config.assets.defaultFile).toBeUndefined();
        expect(config.assets.defaultStatus).toBeUndefined();
        expect(config.assets.convertHtmlToFolders).toBeUndefined();

        expect(config.permanentAssets.include).toEqual({});
        expect(config.permanentAssets.defaultFile).toBeUndefined();
        expect(config.permanentAssets.defaultStatus).toBeUndefined();
        expect(config.permanentAssets.convertHtmlToFolders).toBeUndefined();

        expect(config.app.include).toEqual({});
        expect(config.app.entrypoint).toBeUndefined();
        expect(config.app.copyDependencies).toBeUndefined();
        expect(config.app.bundleDependencies).toBeUndefined();
        expect(config.app.streaming).toBe(false);
        expect(config.app.compression).toBe(true);

        expect(config.debugAssets.include).toEqual({});
    });

    it('should initialize with custom options', () => {
        const options: ConfigOptions = {
            memory: 2048,
            timeout: 30,
        };
        const config = new Config(options);
        expect(config.memory).toBe(2048);
        expect(config.timeout).toBe(30);
    });

    it('should validate a valid config', async () => {
        const config = new Config();
        await expect(config.validate()).resolves.not.toThrow();
    });

    it('should throw an error for invalid memory', async () => {
        const config = new Config({ memory: 0 });
        await expect(config.validate()).rejects.toThrow(CliError);
    });

    it('should throw an error for invalid timeout', async () => {
        const config = new Config({ timeout: 0 });
        await expect(config.validate()).rejects.toThrow(CliError);
    });

    it('should serialize and deserialize correctly', () => {
        const config = new Config();
        const json = config.serialize();
        const deserializedConfig = Config.deserialize(json);
        expect(deserializedConfig).toEqual(config);
    });

    it('should serialize router with regex correctly', () => {
        const config = new Config();
        const srcRouter = config.router;

        srcRouter.addRoute({ path: /(.+)$/ }, [
            {
                type: 'setResponseHeader',
                key: 'x-route-order',
                value: '1',
            },
        ]);

        const deserializedConfig = Config.deserialize(config.serialize());
        const deserializedRouter = deserializedConfig.router;
        expect(deserializedRouter.routes.length).toBe(1);
        expect(deserializedRouter.routes[0].condition?.path?.toString()).toEqual(`/(.+)$/`);
    });

    it('should serialize router with path-to-regex correctly', () => {
        const config = new Config();
        const srcRouter = config.router;

        const srcPathToRegex = '/test/:id*';
        srcRouter.addRoute(
            {
                path: srcPathToRegex,
            },
            [
                {
                    type: 'setResponseHeader',
                    key: 'x-route-order',
                    value: '1',
                },
            ],
        );

        const deserializedConfig = Config.deserialize(config.serialize());
        const deserializedRouter = deserializedConfig.router;
        expect(deserializedRouter.routes.length).toBe(1);
        expect(deserializedRouter.routes[0].condition?.path?.toString()).toEqual(`path-to-regex:/test/:id*`);
    });

    it('should include assets', () => {
        const config = new Config();
        config.includeAsset('./public', './');
        expect(config.assets.include['./public']).toBe('./');
    });

    // Setter methods tests
    describe('setter methods', () => {
        it('should set basic properties', () => {
            const config = new Config();

            config.setOrganization('test-org');
            config.setProject('test-project');
            config.setEnvironment('production');
            config.setRuntime('nodejs20');
            config.setMemory(2048);
            config.setArch('arm64');
            config.setTimeout(60);
            config.setFramework('astro');

            expect(config.organization).toBe('test-org');
            expect(config.project).toBe('test-project');
            expect(config.environment).toBe('production');
            expect(config.runtime).toBe('nodejs20');
            expect(config.memory).toBe(2048);
            expect(config.arch).toBe('arm64');
            expect(config.timeout).toBe(60);
            expect(config.framework).toBe('astro');
        });

        it('should support method chaining', () => {
            const config = new Config()
                .setOrganization('test-org')
                .setProject('test-project')
                .setEnvironment('production')
                .setMemory(2048)
                .setTimeout(60)
                .includeAsset('./public', './')
                .setAppEntrypoint('src/server.mjs');

            expect(config.organization).toBe('test-org');
            expect(config.project).toBe('test-project');
            expect(config.environment).toBe('production');
            expect(config.memory).toBe(2048);
            expect(config.timeout).toBe(60);
            expect(config.assets.include['./public']).toBe('./');
            expect(config.app.entrypoint).toBe('src/server.mjs');
        });
    });

    // Asset management tests
    describe('asset management', () => {
        it('should include different types of assets', () => {
            const config = new Config();

            config.includePermanentAsset('./static', './');
            config.includeDebugAsset('src/package.json');
            config.includeApp('src/server.mjs', './server.mjs');
            config.setAppEntrypoint('src/server.mjs');
            config.setDefaultFile('index.html', '404.html');
            config.setDefaultStatus(404, 500);
            config.setConvertHtmlToFolders(true, false);

            expect(config.permanentAssets.include['./static']).toBe('./');
            expect(config.debugAssets.include['src/package.json']).toBe(true);
            expect(config.app.include['src/server.mjs']).toBe('./server.mjs');
            expect(config.app.entrypoint).toBe('src/server.mjs');
            expect(config.assets.defaultFile).toBe('index.html');
            expect(config.permanentAssets.defaultFile).toBe('404.html');
            expect(config.assets.defaultStatus).toBe(404);
            expect(config.permanentAssets.defaultStatus).toBe(500);
            expect(config.assets.convertHtmlToFolders).toBe(true);
            expect(config.permanentAssets.convertHtmlToFolders).toBe(false);
        });
    });

    // Build and dependency management tests
    describe('build and dependency management', () => {
        it('should set build-related properties', () => {
            const config = new Config();

            config.setSkipFrameworkBuild(true);
            config.setCopyAppDependencies(false);
            config.setBundleAppDependencies(false);
            config.setBuildCommand('npx vite build');
            config.setDevCommand('npx vite dev');

            expect(config.skipFrameworkBuild).toBe(true);
            expect(config.app.copyDependencies).toBe(false);
            expect(config.app.bundleDependencies).toBe(false);
            expect(config.buildCommand).toBe('npx vite build');
            expect(config.devCommand).toBe('npx vite dev');
        });
    });

    // Header management tests
    describe('header management', () => {
        it('should set response headers', () => {
            const config = new Config();
            const headers = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' };
            const result = config.setResponseHeaders(headers);

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(1);
            expect(config.router.routes[0]?.actions).toHaveLength(2);
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'setResponseHeader',
                key: 'X-Frame-Options',
                value: 'DENY',
            });
        });

        it('should set request headers', () => {
            const config = new Config();
            const headers = { Authorization: 'Bearer token' };
            const result = config.setRequestHeaders(headers);

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(1);
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'setRequestHeader',
                key: 'Authorization',
                value: 'Bearer token',
            });
        });

        it('should not add routes when headers object is empty', () => {
            const config = new Config();
            const initialRouteCount = config.router.routes.length;
            const result = config.setResponseHeaders({});

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(initialRouteCount);
        });
    });

    // Redirect and response status tests
    describe('redirect and response status', () => {
        it('should set redirect with default status code', () => {
            const config = new Config();
            const result = config.setRedirect('/old-page', '/new-page');

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(1);
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'redirect',
                statusCode: 302,
                to: '/new-page',
            });
        });

        it('should set redirect with custom status code', () => {
            const config = new Config();
            const result = config.setRedirect('/old-page', '/new-page', 301);

            expect(result).toBe(config);
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'redirect',
                statusCode: 301,
                to: '/new-page',
            });
        });

        it('should set redirect with route condition object', () => {
            const config = new Config();
            const result = config.setRedirect({ path: '/api/:path*', method: 'GET' }, '/new-api', 308);

            expect(result).toBe(config);
            expect(config.router.routes[0]?.condition?.path).toBe('path-to-regex:/api/:path*');
            expect(config.router.routes[0]?.condition?.method).toBe('GET');
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'redirect',
                statusCode: 308,
                to: '/new-api',
            });
        });

        it('should set redirect with path pattern', () => {
            const config = new Config();
            const result = config.setRedirect('/blog/:slug', '/new-blog/:slug', 301);

            expect(result).toBe(config);
            expect(config.router.routes[0]?.condition?.path).toBe('path-to-regex:/blog/:slug');
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'redirect',
                statusCode: 301,
                to: '/new-blog/:slug',
            });
        });

        it('should set response status code', () => {
            const config = new Config();
            const result = config.setResponseStatus(404);

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(1);
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'setResponseStatus',
                statusCode: 404,
            });
        });

        it('should set response status code with route condition', () => {
            const config = new Config();
            const result = config.setResponseStatus(403, '/admin');

            expect(result).toBe(config);
            expect(config.router.routes[0]?.condition?.path).toBe('/admin');
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'setResponseStatus',
                statusCode: 403,
            });
        });

        it('should set response status code with complex route condition', () => {
            const config = new Config();
            const result = config.setResponseStatus(500, { path: '/api/:path*', method: 'POST' });

            expect(result).toBe(config);
            expect(config.router.routes[0]?.condition?.path).toBe('path-to-regex:/api/:path*');
            expect(config.router.routes[0]?.condition?.method).toBe('POST');
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'setResponseStatus',
                statusCode: 500,
            });
        });

        it('should chain redirect and response status methods', () => {
            const config = new Config();
            const result = config.setRedirect('/old-page', '/new-page', 301).setResponseStatus(404, '/not-found');

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(2);

            // Check redirect route
            expect(config.router.routes[0]?.actions?.[0]).toEqual({
                type: 'redirect',
                statusCode: 301,
                to: '/new-page',
            });

            // Check response status route
            expect(config.router.routes[1]?.actions?.[0]).toEqual({
                type: 'setResponseStatus',
                statusCode: 404,
            });
        });
    });

    // Node function tests
    describe('node function management', () => {
        it('should add node function', () => {
            const config = new Config();
            const result = config.addNodeFunction('./urlTransformFunction.js', { path: '/_next/image' });

            expect(result).toBe(config);
            expect(config.router.routes.length).toBe(1);
            expect(config.router.routes[0]?.condition?.path).toBe('/_next/image');
            expect(config.router.routes[0]?.actions?.[0]?.type).toBe('nodeFunction');
            expect((config.router.routes[0]?.actions?.[0] as any)?.path).toMatch(/urlTransformFunction-\d+\.mjs/);

            expect(Object.keys(config.app.include)).toHaveLength(1);
            expect(Object.keys(config.app.include)[0]).toBe('urlTransformFunction.js');
        });
    });

    // Validation tests
    describe('validation', () => {
        it('should throw error for unsupported framework', async () => {
            const config = new Config({ framework: 'unsupported-framework' });
            await expect(config.validate()).rejects.toThrow(CliError);
        });

        it('should throw error for invalid runtime', async () => {
            const config = new Config({ runtime: 'invalid-runtime' });
            await expect(config.validate()).rejects.toThrow(CliError);
        });

        it('should throw error for invalid architecture', async () => {
            const config = new Config({ arch: 'invalid-arch' });
            await expect(config.validate()).rejects.toThrow(CliError);
        });

        it('should throw error for memory too high', async () => {
            const config = new Config({ memory: 10241 });
            await expect(config.validate()).rejects.toThrow(CliError);
        });

        it('should throw error for timeout too high', async () => {
            const config = new Config({ timeout: 901 });
            await expect(config.validate()).rejects.toThrow(CliError);
        });
    });

    // Static methods tests
    describe('static methods', () => {
        it('should get default values', () => {
            const runtime = Config.getDefaultRuntime();
            const arch = Config.getDefaultArch();
            const memory = Config.getDefaultMemory();
            const timeout = Config.getDefaultTimeout();
            const environment = Config.getDefaultEnvironment();
            const project = Config.getDefaultProject();

            expect(typeof runtime).toBe('string');
            expect(runtime).toMatch(/^nodejs\d+/);
            expect(typeof arch).toBe('string');
            expect(['x86_64', 'arm64']).toContain(arch);
            expect(typeof memory).toBe('number');
            expect(memory).toBeGreaterThan(0);
            expect(typeof timeout).toBe('number');
            expect(timeout).toBeGreaterThan(0);
            expect(environment).toBe('default');
            expect(typeof project).toBe('string');
        });
    });

    // Constructor with all options
    describe('constructor with all options', () => {
        it('should handle all ConfigOptions', () => {
            const options: ConfigOptions = {
                cliVersion: '1.0.0',
                project: 'test-project',
                organization: 'test-org',
                environment: 'production',
                runtime: 'nodejs20',
                memory: 2048,
                arch: 'arm64',
                timeout: 60,
                framework: 'astro',
                skipFrameworkBuild: true,
                assets: { include: { './public': './' } },
                permanentAssets: { include: { './static': true } },
                debugAssets: { include: { 'src/package.json': true } },
                app: { include: { 'src/server.mjs': './server.mjs' }, entrypoint: 'src/server.mjs' },
                buildCommand: 'npx vite build',
                devCommand: 'npx vite dev',
            };

            const config = new Config(options);

            expect(config.cliVersion).toBe('1.0.0');
            expect(config.project).toBe('test-project');
            expect(config.organization).toBe('test-org');
            expect(config.environment).toBe('production');
            expect(config.runtime).toBe('nodejs20');
            expect(config.memory).toBe(2048);
            expect(config.arch).toBe('arm64');
            expect(config.timeout).toBe(60);
            expect(config.framework).toBe('astro');
            expect(config.skipFrameworkBuild).toBe(true);
            expect(config.assets.include['./public']).toBe('./');
            expect(config.permanentAssets.include['./static']).toBe(true);
            expect(config.debugAssets.include['src/package.json']).toBe(true);
            expect(config.app.include['src/server.mjs']).toBe('./server.mjs');
            expect(config.app.entrypoint).toBe('src/server.mjs');
            expect(config.buildCommand).toBe('npx vite build');
            expect(config.devCommand).toBe('npx vite dev');
        });
    });

    // toString method test
    describe('toString method', () => {
        it('should return constructor name', () => {
            const config = new Config();
            expect(config.toString()).toBe('Config');
        });
    });
});
