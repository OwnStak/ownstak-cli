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
        expect(config.assets.include).toEqual({});
        expect(config.permanentAssets.include).toEqual({});
        expect(config.debugAssets.include).toEqual({});
        expect(config.app.include).toEqual({});
        expect(config.app.entrypoint).toBeUndefined();
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
});
