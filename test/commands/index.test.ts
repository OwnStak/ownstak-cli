import { jest } from '@jest/globals';

// Mock all command functions
const mockBuild = jest.fn();
const mockDev = jest.fn();
const mockStart = jest.fn();
const mockDeploy = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockUpgrade = jest.fn();
const mockDisplayUpgradeNotice = jest.fn();
const mockConfigInit = jest.fn();
const mockConfigPrint = jest.fn();

// Mock the command modules
jest.unstable_mockModule('../../src/commands/build.js', () => ({
    build: mockBuild,
}));

jest.unstable_mockModule('../../src/commands/dev.js', () => ({
    dev: mockDev,
}));

jest.unstable_mockModule('../../src/commands/start.js', () => ({
    start: mockStart,
}));

jest.unstable_mockModule('../../src/commands/deploy.js', () => ({
    deploy: mockDeploy,
}));

jest.unstable_mockModule('../../src/commands/login.js', () => ({
    login: mockLogin,
}));

jest.unstable_mockModule('../../src/commands/logout.js', () => ({
    logout: mockLogout,
}));

jest.unstable_mockModule('../../src/commands/upgrade.js', () => ({
    upgrade: mockUpgrade,
    displayUpgradeNotice: mockDisplayUpgradeNotice,
}));

jest.unstable_mockModule('../../src/commands/config/init.js', () => ({
    configInit: mockConfigInit,
}));

jest.unstable_mockModule('../../src/commands/config/print.js', () => ({
    configPrint: mockConfigPrint,
}));

describe('commands', () => {
    const runCli = async () => {
        try {
            await import('../../src/commands/index.js');
        } catch (error) {
            // Expected due to mocked process.exit
            if (error.message !== 'process.exit') throw error;
        }
    };

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        jest.spyOn(global, 'setImmediate').mockImplementation(() => 12345 as any);
        jest.spyOn(global, 'setInterval').mockImplementation(() => 12345 as any);
        jest.spyOn(global, 'setTimeout').mockImplementation(() => 12345 as any);
        jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit');
        });
    });

    afterEach(() => {
        process.removeAllListeners('uncaughtException');
        jest.clearAllMocks();
        jest.resetModules();
    });

    describe('build', () => {
        it('should call build command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'build']);
            await runCli();

            expect(mockBuild).toHaveBeenCalledWith(
                expect.objectContaining({
                    framework: undefined,
                }),
            );
        });

        it('should call build command with framework option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'build', 'nextjs']);
            await runCli();

            expect(mockBuild).toHaveBeenCalledWith(
                expect.objectContaining({
                    framework: 'nextjs',
                }),
            );
        });

        it('should call build command with --skip-framework-build option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'build', 'nextjs', '--skip-framework-build']);
            await runCli();

            expect(mockBuild).toHaveBeenCalledWith(
                expect.objectContaining({
                    framework: 'nextjs',
                    skipFrameworkBuild: true,
                }),
            );
        });

        it('should call build command with -s option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'build', 'nextjs', '-s']);
            await runCli();

            expect(mockBuild).toHaveBeenCalledWith(
                expect.objectContaining({
                    framework: 'nextjs',
                    skipFrameworkBuild: true,
                }),
            );
        });

        it('should call build command with --assets-dir, --default-file and --default-status options', async () => {
            jest.replaceProperty(process, 'argv', [
                'npx',
                'ownstak',
                'build',
                'static',
                '--assets-dir',
                './dist',
                '--default-file',
                'index.html',
                '--default-status',
                '200',
            ]);
            await runCli();

            expect(mockBuild).toHaveBeenCalledWith(
                expect.objectContaining({
                    framework: 'static',
                    assetsDir: './dist',
                    defaultFile: 'index.html',
                    defaultStatus: '200',
                }),
            );
        });
    });

    describe('dev', () => {
        it('should call dev command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'dev']);
            await runCli();

            expect(mockDev).toHaveBeenCalled();
        });

        it('should call dev command with framework option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'dev', 'nextjs']);
            await runCli();

            expect(mockDev).toHaveBeenCalledWith(
                expect.objectContaining({
                    framework: 'nextjs',
                }),
            );
        });
    });

    describe('start', () => {
        it('should call start command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'start']);
            await runCli();

            expect(mockStart).toHaveBeenCalled();
        });

        it('should call start command with run alias', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'run']);
            await runCli();

            expect(mockStart).toHaveBeenCalled();
        });
    });

    describe('deplo', () => {
        it('should call deploy command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'deploy']);
            await runCli();

            expect(mockDeploy).toHaveBeenCalled();
            const firstCallArgs = mockDeploy.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://console.ownstak.com',
                }),
            );
        });

        it('should call deploy command with --api-url and --api-token options', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'deploy', '--api-url', 'https://my-api-url.com', '--api-token', 'token123']);
            await runCli();

            expect(mockDeploy).toHaveBeenCalled();
            const firstCallArgs = mockDeploy.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://my-api-url.com',
                    apiToken: 'token123',
                }),
            );
        });

        it('should call deploy command with --local option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'deploy', '--local']);
            await runCli();

            expect(mockDeploy).toHaveBeenCalled();
            const firstCallArgs = mockDeploy.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'http://127.0.0.1:5173',
                }),
            );
        });

        it('should call deploy command with --stage option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'deploy', '--stage']);
            await runCli();

            expect(mockDeploy).toHaveBeenCalled();
            const firstCallArgs = mockDeploy.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://console.stage.ownstak.com',
                }),
            );
        });

        it('should call deploy command with --dev option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'deploy', '--dev']);
            await runCli();

            expect(mockDeploy).toHaveBeenCalled();
            const firstCallArgs = mockDeploy.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://console.dev.ownstak.com',
                }),
            );
        });

        it('should call deploy command with --organization, --project and --environment options', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'deploy', '--organization', 'myorg', '--project', 'myproject', '--environment', 'prod']);
            await runCli();

            expect(mockDeploy).toHaveBeenCalled();
            const firstCallArgs = mockDeploy.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    organization: 'myorg',
                    project: 'myproject',
                    environment: 'prod',
                }),
            );
        });
    });

    describe('login', () => {
        it('should call login command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'login']);
            await runCli();

            expect(mockLogin).toHaveBeenCalled();
        });

        it('should call login command with --api-url option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'login', '--api-url', 'https://my-api-url.com']);
            await runCli();

            expect(mockLogin).toHaveBeenCalled();
            const firstCallArgs = mockLogin.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://my-api-url.com',
                }),
            );
        });

        it('should call login command with --api-token option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'login', '--api-token', 'token123']);
            await runCli();

            expect(mockLogin).toHaveBeenCalled();
            const firstCallArgs = mockLogin.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiToken: 'token123',
                }),
            );
        });

        it('should call login command with --dev option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'login', '--dev']);
            await runCli();

            expect(mockLogin).toHaveBeenCalled();
            const firstCallArgs = mockLogin.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://console.dev.ownstak.com',
                }),
            );
        });
    });

    describe('logout', () => {
        it('should call logout command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'logout']);
            await runCli();

            expect(mockLogout).toHaveBeenCalled();
        });

        it('should call logout command with --api-url option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'logout', '--api-url', 'https://my-api-url.com']);
            await runCli();

            expect(mockLogout).toHaveBeenCalled();
            const firstCallArgs = mockLogout.mock.calls[0];
            expect(firstCallArgs[0]).toEqual(
                expect.objectContaining({
                    apiUrl: 'https://my-api-url.com',
                }),
            );
        });
    });

    describe('upgrade', () => {
        it('should call upgrade command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'upgrade']);
            await runCli();

            expect(mockUpgrade).toHaveBeenCalledWith({
                version: undefined,
            });
        });

        it('should call upgrade command with version option', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'upgrade', '1.2.3']);
            await runCli();

            expect(mockUpgrade).toHaveBeenCalledWith({
                version: '1.2.3',
            });
        });
    });

    describe('config', () => {
        it('should call config init command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'config', 'init']);
            await runCli();

            expect(mockConfigInit).toHaveBeenCalled();
        });

        it('should call config print command', async () => {
            jest.replaceProperty(process, 'argv', ['npx', 'ownstak', 'config', 'print']);
            await runCli();

            expect(mockConfigPrint).toHaveBeenCalled();
        });
    });
});
