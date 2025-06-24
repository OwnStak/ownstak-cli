import { jest } from '@jest/globals';
import { modifyConfigSource } from '../../src/commands/config/init.js';
describe('modifyConfigSource', () => {
    describe('basic functionality', () => {
        it('should add setter methods to a simple Config constructor', () => {
            const sourceCode = `const config = new Config();`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org', project: 'test-project' });

            expect(result).toBe(`const config = new Config().setOrganization("test-org").setProject("test-project");`);
        });

        it('should handle Config constructor with parameters', () => {
            const sourceCode = `const config = new Config({ memory: 2048 });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config({ memory: 2048 }).setOrganization("test-org");`);
        });

        it('should handle empty options object', () => {
            const sourceCode = `const config = new Config();`;
            const result = modifyConfigSource(sourceCode, {});

            expect(result).toBe(`const config = new Config();`);
        });

        it('should handle different data types', () => {
            const sourceCode = `const config = new Config();`;
            const result = modifyConfigSource(sourceCode, {
                organization: 'test-org',
                memory: 2048,
                enabled: true,
            });

            expect(result).toBe(`const config = new Config().setOrganization("test-org").setMemory(2048).setEnabled(true);`);
        });
    });

    describe('multiple Config instances', () => {
        it('should modify all Config instances in the source', () => {
            const sourceCode = `
                const config1 = new Config();
                const config2 = new Config({ timeout: 30 });
                const config3 = new Config();
            `;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`const config1 = new Config().setOrganization("test-org");`);
            expect(result).toContain(`const config2 = new Config({ timeout: 30 }).setOrganization("test-org");`);
            expect(result).toContain(`const config3 = new Config().setOrganization("test-org");`);
        });

        it('should handle nested Config instances', () => {
            const sourceCode = `
                function createConfig() {
                    return new Config();
                }
                const config = new Config();
            `;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`return new Config().setOrganization("test-org");`);
            expect(result).toContain(`const config = new Config().setOrganization("test-org");`);
        });
    });

    describe('complex Config constructors', () => {
        it('should handle Config with complex object parameters', () => {
            const sourceCode = `const config = new Config({ 
                memory: 2048, 
                timeout: 30,
                assets: { include: { './public': './' } }
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({ 
                memory: 2048, 
                timeout: 30,
                assets: { include: { './public': './' } }
            }).setOrganization("test-org");`);
        });

        it('should handle Config with nested parentheses', () => {
            const sourceCode = `const config = new Config({ 
                router: new Router(),
                assets: { include: { './public': './' } }
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({ 
                router: new Router(),
                assets: { include: { './public': './' } }
            }).setOrganization("test-org");`);
        });

        it('should handle Config with function calls as parameters', () => {
            const sourceCode = `const config = new Config({ 
                memory: getMemory(),
                timeout: calculateTimeout()
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({ 
                memory: getMemory(),
                timeout: calculateTimeout()
            }).setOrganization("test-org");`);
        });
    });

    describe('edge cases', () => {
        it('should handle source code without Config instances', () => {
            const sourceCode = `const other = new OtherClass();`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(sourceCode);
        });

        it('should handle malformed Config constructor (missing closing parenthesis)', () => {
            const sourceCode = `const config = new Config({ memory: 2048;`; // Missing closing parenthesis
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            // The function will still try to modify the code, but may not work correctly
            // due to malformed constructor - this is expected behavior
            expect(result).toContain('.setOrganization("test-org")');
        });

        it('should handle Config constructor with comments', () => {
            const sourceCode = `const config = new Config(/* comment */ { memory: 2048 });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config(/* comment */ { memory: 2048 }).setOrganization("test-org");`);
        });

        it('should handle Config constructor with string literals containing parentheses', () => {
            const sourceCode = `const config = new Config({ 
                path: "path/to/(something)",
                regex: /\(.*\)/
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({ 
                path: "path/to/(something)",
                regex: /\(.*\)/
            }).setOrganization("test-org");`);
        });

        it('should handle Config constructor with template literals', () => {
            const sourceCode = `const config = new Config({ 
                path: \`path/to/\${variable}\`
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({ 
                path: \`path/to/\${variable}\`
            }).setOrganization("test-org");`);
        });
    });

    describe('method chaining', () => {
        it('should chain multiple setter methods in correct order', () => {
            const sourceCode = `const config = new Config();`;
            const result = modifyConfigSource(sourceCode, {
                organization: 'test-org',
                project: 'test-project',
                memory: 2048,
                timeout: 30,
            });

            expect(result).toBe(`const config = new Config().setOrganization("test-org").setProject("test-project").setMemory(2048).setTimeout(30);`);
        });

        it('should handle existing method chains', () => {
            const sourceCode = `const config = new Config().setMemory(1024);`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            // Current limitation: the function doesn't preserve existing method chains
            // It only modifies the constructor call itself
            expect(result).toBe(`const config = new Config().setOrganization("test-org").setMemory(1024);`);
        });
    });

    describe('real-world scenarios', () => {
        it('should handle typical config file structure', () => {
            const sourceCode = `
                import { Config } from '@ownstak/cli';
                
                const config = new Config({
                    memory: 1024,
                    timeout: 20
                });
                
                export default config;
            `;
            const result = modifyConfigSource(sourceCode, {
                organization: 'my-org',
                project: 'my-project',
            });

            expect(result).toContain(`new Config({
                    memory: 1024,
                    timeout: 20
                }).setOrganization("my-org").setProject("my-project");`);
        });

        it('should handle config with conditional logic', () => {
            const sourceCode = `
                const config = new Config({
                    memory: process.env.NODE_ENV === 'production' ? 2048 : 1024
                });
            `;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({
                    memory: process.env.NODE_ENV === 'production' ? 2048 : 1024
                }).setOrganization("test-org");`);
        });

        it('should handle config with spread operator', () => {
            const sourceCode = `
                const baseConfig = { memory: 1024 };
                const config = new Config({
                    ...baseConfig,
                    timeout: 20
                });
            `;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toContain(`new Config({
                    ...baseConfig,
                    timeout: 20
                }).setOrganization("test-org");`);
        });
    });

    describe('capitalize function', () => {
        it('should properly capitalize property names', () => {
            const sourceCode = `const config = new Config();`;
            const result = modifyConfigSource(sourceCode, {
                organization: 'test-org',
                projectName: 'test-project',
                apiKey: 'key123',
            });

            expect(result).toBe(`const config = new Config().setOrganization("test-org").setProjectName("test-project").setApiKey("key123");`);
        });

        it('should handle single character property names', () => {
            const sourceCode = `const config = new Config();`;
            const result = modifyConfigSource(sourceCode, { x: 'value' });

            expect(result).toBe(`const config = new Config().setX("value");`);
        });
    });

    describe('comments', () => {
        it('should handle comments with brackets', () => {
            const sourceCode = `const config = new Config({
                memory: 2048, // this is a comment with closing bracket )
                timeout: 30 /* another comment with closing bracket ) */
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config({
                memory: 2048, // this is a comment with closing bracket )
                timeout: 30 /* another comment with closing bracket ) */
            }).setOrganization("test-org");`);
        });

        it('should handle nested parentheses in comments', () => {
            const sourceCode = `const config = new Config({
                memory: 2048, // comment with (nested) parentheses
                timeout: 30 /* another comment with (nested) parentheses */
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config({
                memory: 2048, // comment with (nested) parentheses
                timeout: 30 /* another comment with (nested) parentheses */
            }).setOrganization("test-org");`);
        });

        it('should handle string literals with parentheses', () => {
            const sourceCode = `const config = new Config({
                path: "path/to/(something)",
                regex: /\(.*\)/,
                template: \`path/to/\${variable}\`
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config({
                path: "path/to/(something)",
                regex: /\(.*\)/,
                template: \`path/to/\${variable}\`
            }).setOrganization("test-org");`);
        });

        it('should handle escaped quotes in strings', () => {
            const sourceCode = `const config = new Config({
                path: "path/to/\\"quoted\\"/(something)",
                message: 'This is a \\'quoted\\' string'
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config({
                path: "path/to/\\"quoted\\"/(something)",
                message: 'This is a \\'quoted\\' string'
            }).setOrganization("test-org");`);
        });

        it('should skip new Config() calls in comments', () => {
            const sourceCode = `const config = new Config({
                memory: 2048, // this is a comment with new Config() call
                timeout: 30 /* another comment with new Config() call */
            });`;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            expect(result).toBe(`const config = new Config({
                memory: 2048, // this is a comment with new Config() call
                timeout: 30 /* another comment with new Config() call */
            }).setOrganization("test-org");`);
        });

        it('should only modify actual Config constructors, not those in comments', () => {
            const sourceCode = `
                // const config = new Config({ memory: 1024 }); // This should be ignored
                const config = new Config({ memory: 2048 }); // This should be modified
                /* 
                 * const otherConfig = new Config({ timeout: 30 }); // This should be ignored
                 */
            `;
            const result = modifyConfigSource(sourceCode, { organization: 'test-org' });

            // Should only modify the actual Config constructor, not the ones in comments
            expect(result).toContain(`const config = new Config({ memory: 2048 }).setOrganization("test-org");`);
            expect(result).not.toContain(`new Config({ memory: 1024 }).setOrganization`);
            expect(result).not.toContain(`new Config({ timeout: 30 }).setOrganization`);
        });
    });
});
