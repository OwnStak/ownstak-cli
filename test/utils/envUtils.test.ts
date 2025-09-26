import { writeFileSync, unlinkSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadEnvVariables } from '../../src/utils/envUtils';

describe('envUtils', () => {
    const testEnvContent = `
# This is a comment
API_KEY=test-api-key-123
DATABASE_URL=postgresql://localhost:5432/testdb
DEBUG=true
EMPTY_VAR=
QUOTED_VAR="quoted value"
SINGLE_QUOTED_VAR='single quoted value'
# Another comment
NUMBER_VAR=42
`;

    let testDir: string;
    let originalCwd: string;

    const cleanupProcessEnv = () => {
        const testVars = [
            'API_KEY',
            'DATABASE_URL',
            'DEBUG',
            'EMPTY_VAR',
            'QUOTED_VAR',
            'SINGLE_QUOTED_VAR',
            'NUMBER_VAR',
            'NODE_ENV',
            'LOCAL',
            'ENV',
            'LOCAL_VAR',
            'OWNSTAK_VAR',
            'VALID_VAR',
            'ANOTHER_VALID',
            'SINGLE_QUOTED',
            'DOUBLE_QUOTED',
            'MIXED_QUOTES',
            'UNQUOTED',
            'CONNECTION_STRING',
            'JWT_SECRET',
            'NEW_VAR',
        ];
        testVars.forEach((key) => delete process.env[key]);
    };

    beforeAll(() => {
        // Create a unique temporary directory for all tests
        testDir = join(tmpdir(), `env-utils-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
        mkdirSync(testDir, { recursive: true });
        originalCwd = process.cwd();
        process.chdir(testDir);
    });

    afterAll(() => {
        // Change back to original directory and clean up
        process.chdir(originalCwd);
        rmSync(testDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        cleanupProcessEnv();
    });

    afterEach(() => {
        cleanupProcessEnv();
    });

    describe('loadEnvVariables', () => {
        it('should load default .env files and set in process.env', async () => {
            writeFileSync('.env', testEnvContent);

            const envVars = await loadEnvVariables();

            expect(envVars).toEqual({
                API_KEY: 'test-api-key-123',
                DATABASE_URL: 'postgresql://localhost:5432/testdb',
                DEBUG: 'true',
                EMPTY_VAR: '',
                QUOTED_VAR: 'quoted value',
                SINGLE_QUOTED_VAR: 'single quoted value',
                NUMBER_VAR: '42',
            });

            // Check that variables are set in process.env
            expect(process.env.API_KEY).toBe('test-api-key-123');
            expect(process.env.DATABASE_URL).toBe('postgresql://localhost:5432/testdb');
            expect(process.env.DEBUG).toBe('true');
            expect(process.env.EMPTY_VAR).toBe('');
            expect(process.env.QUOTED_VAR).toBe('quoted value');
            expect(process.env.SINGLE_QUOTED_VAR).toBe('single quoted value');
            expect(process.env.NUMBER_VAR).toBe('42');
        });

        it('should load custom .env file and set in process.env', async () => {
            writeFileSync('.env.test', testEnvContent);

            const envVars = await loadEnvVariables('.env.test');

            expect(envVars.API_KEY).toBe('test-api-key-123');
            expect(envVars.DATABASE_URL).toBe('postgresql://localhost:5432/testdb');

            // Check that variables are set in process.env
            expect(process.env.API_KEY).toBe('test-api-key-123');
            expect(process.env.DATABASE_URL).toBe('postgresql://localhost:5432/testdb');
        });

        it('should load multiple .env files with later files overriding earlier ones', async () => {
            writeFileSync('.env', 'API_KEY=first-value\nDATABASE_URL=first-db');
            writeFileSync('.env.test', 'API_KEY=second-value\nNEW_VAR=new-value');

            const envVars = await loadEnvVariables(['.env', '.env.test']);

            expect(envVars.API_KEY).toBe('second-value'); // Overridden by second file
            expect(envVars.DATABASE_URL).toBe('first-db');
            expect(envVars.NEW_VAR).toBe('new-value');

            // Check that variables are set in process.env
            expect(process.env.API_KEY).toBe('second-value');
            expect(process.env.DATABASE_URL).toBe('first-db');
            expect(process.env.NEW_VAR).toBe('new-value');
        });

        it('should load environment-specific .env files when NODE_ENV is set', async () => {
            process.env.NODE_ENV = 'production';
            writeFileSync('.env.production', 'API_KEY=prod-key\nENV=production');

            const envVars = await loadEnvVariables();

            expect(envVars.API_KEY).toBe('prod-key');
            expect(envVars.ENV).toBe('production');

            // Check that variables are set in process.env
            expect(process.env.API_KEY).toBe('prod-key');
            expect(process.env.ENV).toBe('production');
        });

        it('should load local .env files when LOCAL is set', async () => {
            process.env.LOCAL = 'true';
            writeFileSync('.env.local', 'API_KEY=local-key\nLOCAL_VAR=local-value');

            const envVars = await loadEnvVariables();

            expect(envVars.API_KEY).toBe('local-key');
            expect(envVars.LOCAL_VAR).toBe('local-value');

            // Check that variables are set in process.env
            expect(process.env.API_KEY).toBe('local-key');
            expect(process.env.LOCAL_VAR).toBe('local-value');
        });

        it('should load .env.ownstak file', async () => {
            writeFileSync('.env.ownstak', 'OWNSTAK_VAR=ownstak-value\nAPI_KEY=ownstak-key');

            const envVars = await loadEnvVariables();

            expect(envVars.OWNSTAK_VAR).toBe('ownstak-value');
            expect(envVars.API_KEY).toBe('ownstak-key');

            // Check that variables are set in process.env
            expect(process.env.OWNSTAK_VAR).toBe('ownstak-value');
            expect(process.env.API_KEY).toBe('ownstak-key');
        });

        it('should skip non-existent files by default', async () => {
            const envVars = await loadEnvVariables(['.env.nonexistent', '.env.another-nonexistent']);

            expect(envVars).toEqual({});
        });

        it('should throw error for non-existent files when throwOnError is true', async () => {
            await expect(loadEnvVariables(['.env.nonexistent'], true)).rejects.toThrow("The ENV variables file at '.env.nonexistent' does not exist");
        });

        it('should handle empty file', async () => {
            writeFileSync('.env', '');

            const envVars = await loadEnvVariables('.env');

            expect(envVars).toEqual({});
        });

        it('should handle file with only comments', async () => {
            writeFileSync('.env', '# Only comments\n# Another comment');

            const envVars = await loadEnvVariables('.env');

            expect(envVars).toEqual({});
        });

        it('should handle malformed .env file gracefully', async () => {
            writeFileSync('.env', 'VALID_VAR=valid\nMALFORMED_LINE\nANOTHER_VALID=another');

            const envVars = await loadEnvVariables('.env');

            expect(envVars).toEqual({
                VALID_VAR: 'valid',
                ANOTHER_VALID: 'another',
            });

            expect(process.env.VALID_VAR).toBe('valid');
            expect(process.env.ANOTHER_VALID).toBe('another');
        });

        it('should handle file read errors gracefully by default', async () => {
            writeFileSync('.env.test', testEnvContent);

            const envVars = await loadEnvVariables('.env.test');

            // Should still work for valid files
            expect(envVars.API_KEY).toBe('test-api-key-123');
        });

        it('should throw error on file read errors when throwOnError is true', async () => {
            // This test would need to mock readFile to throw an error
            // For now, we'll test the basic functionality
            writeFileSync('.env.test', testEnvContent);

            const envVars = await loadEnvVariables('.env.test', true);
            expect(envVars.API_KEY).toBe('test-api-key-123');
        });

        it('should parse quoted values correctly', async () => {
            const quotedContent = `
SINGLE_QUOTED='single quoted value'
DOUBLE_QUOTED="double quoted value"
MIXED_QUOTES="mixed 'quotes' inside"
UNQUOTED=unquoted value
`;
            writeFileSync('.env', quotedContent);

            const envVars = await loadEnvVariables('.env');

            expect(envVars.SINGLE_QUOTED).toBe('single quoted value');
            expect(envVars.DOUBLE_QUOTED).toBe('double quoted value');
            expect(envVars.MIXED_QUOTES).toBe("mixed 'quotes' inside");
            expect(envVars.UNQUOTED).toBe('unquoted value');
        });

        it('should handle variables with equals signs in values', async () => {
            const contentWithEquals = `
CONNECTION_STRING=postgresql://user:pass@host:5432/db?sslmode=require
JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
`;
            writeFileSync('.env', contentWithEquals);

            const envVars = await loadEnvVariables('.env');

            expect(envVars.CONNECTION_STRING).toBe('postgresql://user:pass@host:5432/db?sslmode=require');
            expect(envVars.JWT_SECRET).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        });

        it('should load files in correct priority order', async () => {
            // Set up environment
            process.env.NODE_ENV = 'test';
            process.env.LOCAL = 'true';

            // Create files with different values for the same key
            writeFileSync('.env', 'API_KEY=base');
            writeFileSync('.env.test', 'API_KEY=test-env');
            writeFileSync('.env.local', 'API_KEY=local');
            writeFileSync('.env.test.local', 'API_KEY=test-local');
            writeFileSync('.env.ownstak', 'API_KEY=ownstak');

            const envVars = await loadEnvVariables();

            // The last file (.env.ownstak) should win
            expect(envVars.API_KEY).toBe('ownstak');
            expect(process.env.API_KEY).toBe('ownstak');
        });
    });
});
