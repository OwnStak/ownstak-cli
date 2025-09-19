import { jest } from '@jest/globals';

describe('Logger', () => {
    let Logger, logger, LogLevel, LOG_FORMATS;
    let originalConsole: any;
    let originalStdoutWrite: any;
    let originalStderrWrite: any;
    let stdoutSpy: any;
    let stderrSpy: any;
    let originalIsTTY: boolean;

    beforeAll(async () => {
        // Store original isTTY value
        originalIsTTY = process.stdout.isTTY;

        // Store original console methods
        originalConsole = {
            log: globalThis.console.log,
            error: globalThis.console.error,
            warn: globalThis.console.warn,
            info: globalThis.console.info,
            debug: globalThis.console.debug,
            trace: globalThis.console.trace,
        };

        // Store original stream methods
        originalStdoutWrite = process.stdout.write;
        originalStderrWrite = process.stderr.write;

        // Create spies for stdout and stderr
        stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

        // Reset environment variables
        process.env.LOG_LEVEL = 'debug';
        process.env.LOG_FORMAT = 'text';
        process.env.OWNSTAK_SECRETS = '';

        ({ Logger, logger, LogLevel, LOG_FORMATS } = await import('../src/logger'));
    });

    beforeEach(() => {
        stdoutSpy.mockClear();
        stderrSpy.mockClear();
    });

    afterAll(() => {
        // Restore original console methods
        globalThis.console.log = originalConsole.log;
        globalThis.console.error = originalConsole.error;
        globalThis.console.warn = originalConsole.warn;
        globalThis.console.info = originalConsole.info;
        globalThis.console.debug = originalConsole.debug;
        globalThis.console.trace = originalConsole.trace;

        // Restore original stream methods
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;

        // Restore original isTTY value
        process.stdout.isTTY = originalIsTTY;

        // Clear spies
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    describe('overrideConsole', () => {
        beforeAll(() => {
            logger.overrideConsole();
        });

        it('should override console.log to use logger', () => {
            console.log('log message');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('log message'));
        });

        it('should override console.debug to use logger', () => {
            console.debug('debug message');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('debug message'));
        });

        it('should override console.info to use logger', () => {
            console.info('info message');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
        });

        it('should override console.warn to use logger', () => {
            console.warn('warn message');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('warn message'));
        });

        it('should override console.error to use logger', () => {
            console.error('error message');
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('error message'));
        });

        it('should override console.trace to use logger', () => {
            console.trace('trace message');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('trace message'));
        });

        it('should handle multiple console arguments', () => {
            console.log('test message1', 'test message2');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('test message1'));
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('test message2'));
        });

        it('should handle logging of errors', () => {
            const err = new Error('my error message');
            console.error(err);
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(err.stack || ''));
        });

        it('should handle logging of objects', () => {
            const obj = { key: 'value', nested: { key2: 'value2' } };
            console.log(obj);
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(JSON.parse(lastCall)).toMatchObject({ key: 'value', nested: { key2: 'value2' } });
        });

        it('should handle logging of objects with circular references', () => {
            const obj: any = { key: 'value' };
            obj.self = obj;
            console.log(obj);
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(JSON.parse(lastCall)).toMatchObject({ key: 'value', self: '[CIRCULAR]' });
        });
    });

    describe('overrideStdStreams', () => {
        beforeAll(() => {
            logger.overrideStdStreams();
        });

        it('should override stdout.write', () => {
            process.stdout.write('test output');
            expect(stdoutSpy).toHaveBeenCalledWith('test output');
        });

        it('should override stderr.write', () => {
            process.stderr.write('error output');
            expect(stderrSpy).toHaveBeenCalledWith('error output');
        });
    });

    describe('formatMessage', () => {
        afterAll(() => delete process.env.LOG_FORMAT);

        describe('json format', () => {
            beforeAll(() => (process.env.LOG_FORMAT = 'json'));

            it('should format message as json', () => {
                const result = logger.formatMessage(LogLevel.INFO, 'test message');
                expect(JSON.parse(result)).toEqual({
                    type: 'ownstak.log',
                    message: 'test message',
                    level: 'INFO',
                    timestamp: expect.any(String),
                });
            });

            it('should format message as json with metadata', () => {
                const result = logger.formatMessage(LogLevel.INFO, 'test message', {
                    requestId: '456',
                });
                expect(JSON.parse(result)).toEqual({
                    type: 'ownstak.log',
                    message: 'test message',
                    level: 'INFO',
                    timestamp: expect.any(String),
                    requestId: '456',
                });
            });

            it('should map custom log levels to INFO', () => {
                const result = logger.formatMessage(LogLevel.SUCCESS, 'test message');
                expect(JSON.parse(result)).toEqual({
                    type: 'ownstak.log',
                    message: 'test message',
                    level: 'INFO',
                    timestamp: expect.any(String),
                });
            });

            it('should output multiline message as single log entry', () => {
                const result = logger.formatMessage(LogLevel.SUCCESS, 'test message\r\nsecond line');
                expect(JSON.parse(result)).toEqual({
                    type: 'ownstak.log',
                    message: 'test message\r\nsecond line',
                    level: 'INFO',
                    timestamp: expect.any(String),
                });
            });
        });

        describe('text format', () => {
            beforeAll(() => (process.env.LOG_FORMAT = 'text'));

            it('should format message as text with prefix', () => {
                const result = logger.formatMessage(LogLevel.INFO, 'test message');
                expect(result).toMatch(/(AM|PM)/);
                expect(result).toMatch(/test message$/);
            });

            it('should format message as text without prefix', () => {
                const result = logger.formatMessage(LogLevel.NONE, 'test message');
                expect(result).not.toMatch(/(AM|PM)/);
                expect(result).toMatch(/test message$/);
            });

            it('should add prefix only to first line', () => {
                const result = logger.formatMessage(LogLevel.INFO, 'test message\r\nsecond line');
                expect(result).toMatch(/test message/);
                expect(result).toMatch(/second line/);
                expect(result.match(/(AM|PM)/).length).toBe(2);
            });
        });
    });

    describe('hideSecrets', () => {
        beforeAll(() => {
            process.env.OWNSTAK_SECRETS = 'API_KEY,SECRET_TOKEN';
            process.env.API_KEY = 'secret-api-key-123';
            process.env.SECRET_TOKEN = 'secret-token-456';
            logger = new Logger();
        });

        it('should hide secret environment variables in strings', () => {
            const result = logger.hideSecrets('My API key is secret-api-key-123');
            expect(result).toContain('OWNSTAK_REDACTED_API_KEY');
            expect(result).not.toContain('secret-api-key-123');
        });

        it('should hide secret environment variables in objects', () => {
            const obj = { apiKey: 'secret-api-key-123', other: 'value' };
            const result = logger.hideSecrets(obj);
            expect(result.apiKey).toContain('OWNSTAK_REDACTED');
            expect(result.other).toBe('value');
        });

        it('should hide secret environment variables in arrays', () => {
            const arr = ['secret-api-key-123', 'other-value'];
            const result = logger.hideSecrets(arr);
            expect(result[0]).toContain('OWNSTAK_REDACTED');
            expect(result[1]).toBe('other-value');
        });

        it('should hide sensitive key patterns', () => {
            const obj = {
                password: 'mypassword',
                api_key: 'somekey',
                authorization: 'bearer token',
                cookie: 'session=123',
                'set-cookie': 'session=123',
            };
            const result = logger.hideSecrets(obj);
            expect(result['password']).toContain('OWNSTAK_REDACTED');
            expect(result['api_key']).toContain('OWNSTAK_REDACTED');
            expect(result['authorization']).toContain('OWNSTAK_REDACTED');
            expect(result['cookie']).toContain('OWNSTAK_REDACTED');
            expect(result['set-cookie']).toContain('OWNSTAK_REDACTED');
        });

        it('should hide credit card patterns', () => {
            const result = logger.hideSecrets('Card: 1234-5678-9012-3456');
            expect(result).toContain('OWNSTAK_REDACTED');
            expect(result).not.toContain('1234-5678-9012-3456');
        });

        it('should handle null and undefined values', () => {
            expect(logger.hideSecrets(null)).toBeNull();
            expect(logger.hideSecrets(undefined)).toBeUndefined();
            expect(logger.hideSecrets(true)).toBe(true);
        });

        it('should recursively hide secrets in nested objects', () => {
            const obj = {
                user: {
                    password: 'secret',
                    data: {
                        token: 'abc123',
                    },
                },
            };
            const result = (logger as any).hideSecrets(obj);
            expect(result.user.password).toContain('OWNSTAK_REDACTED');
            expect(result.user.data.token).toContain('OWNSTAK_REDACTED');
        });
    });

    describe('log levels', () => {
        afterAll(() => (process.env.LOG_LEVEL = 'debug'));

        it('should not log messages below current level', () => {
            process.env.LOG_LEVEL = 'warn';

            logger.debug('debug message');
            logger.info('info message');
            logger.warn('warn message');
            logger.error('error message');

            expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('debug message'));
            expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('info message'));
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('warn message'));
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('error message'));
        });

        it('should log messages at or above current level', () => {
            process.env.LOG_LEVEL = 'info';
            logger = new Logger();

            logger.info('info message');
            logger.warn('warn message');
            logger.error('error message');

            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('warn message'));
            expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('error message'));
        });
    });

    describe('log methods', () => {
        it('should log debug messages', () => {
            logger.debug('debug message');
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('debug message');
        });

        it('should log info messages', () => {
            logger.info('info message');
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('info message');
        });

        it('should log warn messages', () => {
            logger.warn('warn message');
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('warn message');
        });

        it('should log error messages to stderr', () => {
            logger.error('error message');
            expect(stderrSpy).toHaveBeenCalled();
            const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('error message');
        });

        it('should log success messages', () => {
            logger.success('success message');
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('success message');
        });

        it('should log none level messages', () => {
            logger.none('none message');
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('none message');
        });

        it('should log with metadata', () => {
            const metadata = { userId: '123' };
            logger.info('message', metadata);
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('message');
        });

        it('should handle Error objects', () => {
            const error = new Error('test error');
            logger.error(error.message);
            expect(stderrSpy).toHaveBeenCalled();
            const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('test error');
        });

        it('should handle objects by stringifying them', () => {
            const obj = { key: 'value' };
            logger.info(JSON.stringify(obj));
            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            expect(lastCall).toContain('\"key\":\"value\"');
        });
    });

    describe('drawTable', () => {
        it('should draw table with lines', () => {
            const lines = ['Line 1', 'Line 2'];
            logger.drawTable(lines);
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Line 1'));
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Line 2'));
        });

        it('should draw table with title', () => {
            const lines = ['Line 1'];
            logger.drawTable(lines, { title: 'Test', minWidth: 20 });
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Test'));
        });

        it('should handle empty lines array', () => {
            logger.drawTable([]);
            expect(stdoutSpy).not.toHaveBeenCalled();
        });

        it('should handle multiline content', () => {
            const lines = ['Line 1\nLine 1 continued', 'Line 2'];
            logger.drawTable(lines);
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Line 1'));
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Line 1 continued'));
        });
    });

    describe('drawTitle', () => {
        it('should draw title', () => {
            logger.drawTitle('Test Title');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Test Title'));
        });
    });

    describe('drawSubtitle', () => {
        it('should draw subtitle', () => {
            logger.drawSubtitle('Test Subtitle', 'with label');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Test Subtitle'));
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('with label'));
        });
    });

    describe('log format', () => {
        it('should respect LOG_FORMAT environment variable', () => {
            process.env.LOG_FORMAT = 'json';
            logger = new Logger();
            expect(logger.format).toBe(LOG_FORMATS.json);
        });

        it('should default to text format when LOG_FORMAT is invalid', () => {
            process.env.LOG_FORMAT = 'invalid';
            logger = new Logger();
            expect(logger.format).toBe(LOG_FORMATS.text);
        });

        it('should default to text format when LOG_FORMAT is not set', () => {
            logger = new Logger();
            expect(logger.format).toBe(LOG_FORMATS.text);
        });
    });

    describe('metadata', () => {
        it('should include globally set metadata to every log entry', () => {
            process.env.LOG_FORMAT = 'json';
            logger = new Logger();

            const metadata = { userId: '123' };
            logger.init(metadata);
            logger.info('test message');

            expect(stdoutSpy).toHaveBeenCalled();
            const lastCall = stdoutSpy.mock.calls[stdoutSpy.mock.calls.length - 1][0];
            const parsed = JSON.parse(lastCall);
            expect(parsed.userId).toBe('123');
        });
    });

    describe('spinner functionality', () => {
        let originalIsTTY: boolean;

        beforeEach(() => {
            originalIsTTY = process.stdout.isTTY;
            process.env.LOG_FORMAT = 'text';
        });

        afterEach(() => {
            process.stdout.isTTY = originalIsTTY;
            delete process.env.LOG_FORMAT;
            if (logger.spinnerInterval) {
                logger.stopSpinner();
            }
        });

        it('should start and stop spinner correctly', () => {
            process.stdout.isTTY = true;
            logger = new Logger();

            logger.startSpinner('Test spinner');
            expect(logger.spinnerInterval).toBeTruthy();
            expect(logger.spinnerMessage).toBe('Test spinner');

            logger.stopSpinner('Done!', LogLevel.SUCCESS);
            expect(logger.spinnerInterval).toBeNull();
            expect(logger.spinnerMessage).toBeNull();
        });

        it('should handle non-TTY environment gracefully', () => {
            process.stdout.isTTY = false;
            logger = new Logger();

            logger.startSpinner('Loading...');
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
            expect(logger.spinnerInterval).toBeNull();
            logger.stopSpinner('Success!', LogLevel.SUCCESS);
            expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Success!'));
            expect(logger.spinnerMessage).toBeNull();
        });

        it('should update spinner message', () => {
            process.stdout.isTTY = true;
            logger = new Logger();

            logger.startSpinner('Initial message');
            logger.updateSpinner('Updated message');

            expect(logger.spinnerMessage).toBe('Updated message');
        });

        it('should not crash when stopping spinner that was not started', () => {
            logger = new Logger();
            expect(() => {
                logger.stopSpinner('No spinner was running');
            }).not.toThrow();
        });
    });
});
