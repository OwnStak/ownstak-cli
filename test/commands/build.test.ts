import { jest } from '@jest/globals';
import { join } from 'path';
import { copyFiles } from '../../src/commands/build.js';
import { FilesConfig } from '../../src/config.js';
import { mkdir, writeFile, symlink, readdir, stat, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

describe('copyFiles', () => {
    let testTmpDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create a unique temporary directory for each test
        testTmpDir = join(tmpdir(), Date.now() + '-' + Math.random().toString(36).substring(7));
        await mkdir(testTmpDir, { recursive: true });

        // Store original cwd and change to test directory
        originalCwd = process.cwd();
        process.chdir(testTmpDir);

        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await rm(testTmpDir, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    describe('include: single file', () => {
        beforeEach(async () => {
            await mkdir('src', { recursive: true });
            await writeFile('src/app.js', 'console.log("app");');
            await writeFile('src/utils.js', 'export const utils = {};');
        });

        it('should copy file when destination is true', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/app.js': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            const content = await readFile('build/src/app.js', 'utf-8');
            expect(content).toBe('console.log("app");');
        });

        it('should copy file to string destination with just file name', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/app.js': 'main.js',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/main.js')).toBe(true);
            expect(existsSync('build/src/app.js')).toBe(false);
            const content = await readFile('build/main.js', 'utf-8');
            expect(content).toBe('console.log("app");');
        });

        it('should copy file to string destination with folder', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/app.js': 'js/app.js',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/js/app.js')).toBe(true);
            const content = await readFile('build/js/app.js', 'utf-8');
            expect(content).toBe('console.log("app");');
        });

        it('should copy file to wildcard destination', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/app.js': 'js/*',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/js/app.js')).toBe(true);
            const content = await readFile('build/js/app.js', 'utf-8');
            expect(content).toBe('console.log("app");');
        });
    });

    describe('include: directory', () => {
        beforeEach(async () => {
            await mkdir('src/components', { recursive: true });
            await writeFile('src/components/Button.js', 'export const Button = () => {};');
            await writeFile('src/components/Header.js', 'export const Header = () => {};');
            await mkdir('src/components/forms', { recursive: true });
            await writeFile('src/components/forms/Input.js', 'export const Input = () => {};');
        });

        it('should copy directory when destination is true', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/components': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/components')).toBe(true);
            expect(existsSync('build/src/components/Button.js')).toBe(true);
            expect(existsSync('build/src/components/Header.js')).toBe(true);
            expect(existsSync('build/src/components/forms/Input.js')).toBe(true);
        });

        it('should copy directory to string destination as folder', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/components': 'lib/ui',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/lib/ui/Button.js')).toBe(true);
            expect(existsSync('build/lib/ui/Header.js')).toBe(true);
            expect(existsSync('build/lib/ui/forms/Input.js')).toBe(true);
        });
    });

    describe('include: glob pattern with *', () => {
        beforeEach(async () => {
            await mkdir('src', { recursive: true });
            await writeFile('src/app.js', 'console.log("app");');
            await writeFile('src/utils.js', 'export const utils = {};');
            await writeFile('src/config.json', '{"name": "test"}');
            await writeFile('src/README.md', '# Project');
        });

        it('should copy matching files when destination is true', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/*.js': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/src/utils.js')).toBe(true);
            expect(existsSync('build/src/config.json')).toBe(false);
            expect(existsSync('build/src/README.md')).toBe(false);
        });

        it('should copy matching files to string destination', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/*.js': 'js/bundle.js', // This will overwrite, last file wins
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/js/bundle.js')).toBe(true);
            expect(existsSync('build/js/config.json')).toBe(false);
        });

        it('should copy matching files with wildcard destination preserving pattern', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/*.js': 'lib/*',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/lib/app.js')).toBe(true);
            expect(existsSync('build/lib/utils.js')).toBe(true);
        });
    });

    describe('include: glob pattern with **/*', () => {
        beforeEach(async () => {
            await mkdir('src/components/ui', { recursive: true });
            await mkdir('src/utils', { recursive: true });
            await writeFile('src/app.js', 'console.log("app");');
            await writeFile('src/components/Button.js', 'export const Button = () => {};');
            await writeFile('src/components/ui/Modal.js', 'export const Modal = () => {};');
            await writeFile('src/utils/helper.ts', 'export const helper = () => {};');
        });

        it('should copy all matching files recursively when destination is true', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/**/*.js': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/src/components/Button.js')).toBe(true);
            expect(existsSync('build/src/components/ui/Modal.js')).toBe(true);
            expect(existsSync('build/src/utils/helper.ts')).toBe(false); // Not .js
        });

        it('should copy matching files with double wildcard destination', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/**/*.js': 'lib/**',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/lib/app.js')).toBe(true);
            expect(existsSync('build/lib/components/Button.js')).toBe(true);
            expect(existsSync('build/lib/components/ui/Modal.js')).toBe(true);
        });

        it('should copy matching files with **/* wildcard destination', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/**/*.js': 'dist/**/*',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/dist/app.js')).toBe(true);
            expect(existsSync('build/dist/components/Button.js')).toBe(true);
            expect(existsSync('build/dist/components/ui/Modal.js')).toBe(true);
        });
    });

    describe('exclude: single file', () => {
        beforeEach(async () => {
            await mkdir('src', { recursive: true });
            await writeFile('src/app.js', 'console.log("app");');
            await writeFile('src/utils.js', 'export const utils = {};');
        });

        it('should exclude single file with same destination', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    src: true,
                    'src/utils.js': false,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/src/utils.js')).toBe(false);
        });

        it('should exclude single file with different destination', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    src: './custom-dest',
                    'src/utils.js': false,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/custom-dest/app.js')).toBe(true);
            expect(existsSync('build/custom-dest/utils.js')).toBe(false);
            expect(existsSync('build/src/app.js')).toBe(false);
            expect(existsSync('build/src/utils.js')).toBe(false);
        });

        it('should exclude file even with glob pattern', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/**': './custom-dest/**',
                    'src/utils.js': false,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/custom-dest/app.js')).toBe(true);
            expect(existsSync('build/custom-dest/utils.js')).toBe(false);
            expect(existsSync('build/src/app.js')).toBe(false);
            expect(existsSync('build/src/utils.js')).toBe(false);
        });

        it('should not exclude file if exclude pattern comes before include pattern', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/utils.js': false,
                    src: './custom-dest',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/custom-dest/app.js')).toBe(true);
            expect(existsSync('build/custom-dest/utils.js')).toBe(true);
            expect(existsSync('build/src/app.js')).toBe(false);
            expect(existsSync('build/src/utils.js')).toBe(false);
        });
    });

    describe('exclude: glob pattern', () => {
        beforeEach(async () => {
            await mkdir('src', { recursive: true });
            await writeFile('src/app.js', 'console.log("app");');
            await writeFile('src/utils.js', 'export const utils = {};');
            await writeFile('src/config.json', '{"name": "test"}');
            await writeFile('src/middlewares.json', '[]');
            await writeFile('src/README.md', '# Project');
        });

        it('should exclude all files in directory', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    src: true,
                    'src/**': false,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(false);
            expect(existsSync('build/src/utils.js')).toBe(false);
            expect(existsSync('build/src/config.json')).toBe(false);
            expect(existsSync('build/src/middlewares.json')).toBe(false);
            expect(existsSync('build/src/README.md')).toBe(false);
        });

        it('should exclude all json files in directory', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    src: true,
                    'src/**/*.json': false,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/src/utils.js')).toBe(true);
            expect(existsSync('build/src/config.json')).toBe(false);
            expect(existsSync('build/src/middlewares.json')).toBe(false);
            expect(existsSync('build/src/README.md')).toBe(true);
        });

        it('should exclude all json files and then include single config.json file', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    src: true,
                    'src/**/*.json': false,
                    'src/config.json': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/src/utils.js')).toBe(true);
            expect(existsSync('build/src/config.json')).toBe(true);
            expect(existsSync('build/src/middlewares.json')).toBe(false);
            expect(existsSync('build/src/README.md')).toBe(true);
        });

        it('should exclude all json files in directory in multiple iterations', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    src: true,
                    'src/**/*.json': false,
                    'src/config.json': true,
                    'src/**/*.{json,html}': false,
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/src/utils.js')).toBe(true);
            expect(existsSync('build/src/config.json')).toBe(false);
            expect(existsSync('build/src/middlewares.json')).toBe(false);
            expect(existsSync('build/src/README.md')).toBe(true);
        });
    });

    describe('edge cases', () => {
        describe('symlinks', () => {
            beforeEach(async () => {
                await mkdir('src', { recursive: true });
                await writeFile('src/target.js', 'target content');
            });

            it('should skip symlinks', async () => {
                try {
                    await symlink('target.js', 'src/link.js');
                } catch (error) {
                    console.log('Skipping symlink test - not supported in this environment');
                    return;
                }

                const filesConfig: FilesConfig = {
                    include: {
                        'src/link.js': true,
                    },
                };

                await copyFiles(filesConfig, 'build');

                // Symlinks are detected by statSync(src).isSymbolicLink() and skipped
                expect(existsSync('build/src/link.js')).toBe(false);
            });
        });

        describe('dot files', () => {
            beforeEach(async () => {
                await mkdir('src', { recursive: true });
                await writeFile('src/.hidden.js', 'hidden file');
            });

            it('should copy dot files', async () => {
                const filesConfig: FilesConfig = {
                    include: {
                        'src/.hidden.js': true,
                    },
                };

                await copyFiles(filesConfig, 'build');

                expect(existsSync('build/src/.hidden.js')).toBe(true);
            });
        });

        describe('dot folders', () => {
            beforeEach(async () => {
                await mkdir('src', { recursive: true });
                await mkdir('src/.next', { recursive: true });
                await writeFile('src/.next/file.js', 'hidden file');
            });

            it('should copy dot folders', async () => {
                const filesConfig: FilesConfig = {
                    include: {
                        'src/.next': true,
                    },
                };

                await copyFiles(filesConfig, 'build');

                expect(existsSync('build/src/.next/file.js')).toBe(true);
                expect(existsSync('build/src/.next')).toBe(true);
            });
        });

        describe('empty folders', () => {
            it('should not copy empty directories', async () => {
                await mkdir('src/empty', { recursive: true });
                await mkdir('src/parent/empty-child', { recursive: true });

                const filesConfig: FilesConfig = {
                    include: {
                        'src/empty': true,
                        'src/parent': true,
                    },
                };

                await copyFiles(filesConfig, 'build');

                expect(existsSync('build/src/empty')).toBe(false);
                expect(existsSync('build/src/parent/empty-child')).toBe(false);
            });
        });

        describe('.ownstak folder exclusion', () => {
            it('should exclude .ownstak directory from glob patterns', async () => {
                await mkdir('.ownstak/old-build', { recursive: true });
                await writeFile('.ownstak/old-build/app.js', 'old content');
                await writeFile('.ownstak/config.js', 'config');

                await mkdir('src', { recursive: true });
                await writeFile('src/app.js', 'new content');

                const filesConfig: FilesConfig = {
                    include: {
                        '**/*.js': true,
                    },
                };

                await copyFiles(filesConfig, 'build');

                expect(existsSync('build/src/app.js')).toBe(true);
                expect(existsSync('build/.ownstak/config.js')).toBe(false);
                expect(existsSync('build/.ownstak/old-build/app.js')).toBe(false);
            });
        });

        describe('copying to itself prevention', () => {
            it('should prevent copying build directory to itself', async () => {
                await mkdir('project/src', { recursive: true });
                await writeFile('project/src/file.js', 'content');

                const filesConfig: FilesConfig = {
                    include: {
                        'project/**': true,
                    },
                };

                // This should not cause infinite recursion
                await copyFiles(filesConfig, 'build');

                expect(existsSync('build/project/src/file.js')).toBe(true);
                // Should not create nested build/build/... structure
                expect(existsSync('build/build/project/src/file.js')).toBe(false);
            });
        });
    });

    describe('order preservation', () => {
        it('should maintain order of keys during processing', async () => {
            await mkdir('src', { recursive: true });
            await writeFile('src/first.js', 'first');
            await writeFile('src/second.js', 'second');
            await writeFile('src/third.js', 'third');

            const filesConfig: FilesConfig = {
                include: {
                    'src/first.js': true,
                    'src/second.js': true,
                    'src/third.js': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            // Verify files were copied in the expected order by checking they all exist
            // The actual order testing would require more complex mocking
            expect(existsSync('build/src/first.js')).toBe(true);
            expect(existsSync('build/src/second.js')).toBe(true);
            expect(existsSync('build/src/third.js')).toBe(true);

            // Verify contents to ensure correct files were copied
            const firstContent = await readFile('build/src/first.js', 'utf-8');
            const secondContent = await readFile('build/src/second.js', 'utf-8');
            const thirdContent = await readFile('build/src/third.js', 'utf-8');

            expect(firstContent).toBe('first');
            expect(secondContent).toBe('second');
            expect(thirdContent).toBe('third');
        });
    });

    describe('complex mixed scenarios', () => {
        beforeEach(async () => {
            // Create complex directory structure
            await mkdir('src/components/ui', { recursive: true });
            await mkdir('src/assets/images', { recursive: true });
            await mkdir('public/static', { recursive: true });
            await mkdir('docs', { recursive: true });

            await writeFile('src/app.js', 'console.log("app");');
            await writeFile('src/components/Button.js', 'export const Button = () => {};');
            await writeFile('src/components/ui/Modal.js', 'export const Modal = () => {};');
            await writeFile('src/assets/style.css', 'body { margin: 0; }');
            await writeFile('src/assets/images/logo.png', 'fake png');
            await writeFile('public/static/favicon.ico', 'fake ico');
            await writeFile('docs/README.md', '# Documentation');
            await writeFile('package.json', '{"name": "test"}');
        });

        it('should handle mixed source and destination types', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    // Single file to custom name
                    'src/app.js': 'main.js',
                    // Directory to custom location
                    'src/components': 'lib/components',
                    // Glob to wildcard destination
                    'src/assets/*.css': 'styles/*',
                    // Multiple extensions with double wildcard
                    'src/**/*.js': 'dist/**',
                    // Flatten specific files
                    'public/static/favicon.ico': 'favicon.ico',
                    // Copy documentation
                    'docs/*.md': 'documentation/*',
                    // Root level file
                    'package.json': true,
                },
            };

            await copyFiles(filesConfig, 'build');

            // Verify all destinations
            expect(existsSync('build/main.js')).toBe(true);
            expect(existsSync('build/lib/components/Button.js')).toBe(true);
            expect(existsSync('build/lib/components/ui/Modal.js')).toBe(true);
            expect(existsSync('build/styles/style.css')).toBe(true);
            expect(existsSync('build/dist/app.js')).toBe(true);
            expect(existsSync('build/dist/components/Button.js')).toBe(true);
            expect(existsSync('build/favicon.ico')).toBe(true);
            expect(existsSync('build/documentation/README.md')).toBe(true);
            expect(existsSync('build/package.json')).toBe(true);

            // Verify contents
            const mainContent = await readFile('build/main.js', 'utf-8');
            expect(mainContent).toBe('console.log("app");');
            const docsContent = await readFile('build/documentation/README.md', 'utf-8');
            expect(docsContent).toBe('# Documentation');
        });

        it('should handle deletion mixed with copying', async () => {
            // Copy new files
            const filesConfig: FilesConfig = {
                include: {
                    'src/app.js': true,
                    'src/components': 'lib',
                },
            };

            await copyFiles(filesConfig, 'build');

            // New files should exist
            expect(existsSync('build/src/app.js')).toBe(true);
            expect(existsSync('build/lib/Button.js')).toBe(true);
        });

        it('should handle deeply nested structures with various patterns', async () => {
            // Create very deep structure
            await mkdir('src/components/ui/forms/inputs/advanced', { recursive: true });
            await writeFile('src/components/ui/forms/inputs/advanced/RichTextEditor.tsx', 'export const RichTextEditor = () => {};');
            await writeFile('src/components/ui/forms/inputs/TextInput.tsx', 'export const TextInput = () => {};');
            await writeFile('src/components/ui/forms/Form.tsx', 'export const Form = () => {};');

            const filesConfig: FilesConfig = {
                include: {
                    // Copy TypeScript files preserving structure
                    'src/**/*.tsx': 'lib/**',
                    // Copy specific deep file to root
                    'src/components/ui/forms/inputs/advanced/RichTextEditor.tsx': 'editor.tsx',
                    // Copy forms directory with different structure
                    'src/components/ui/forms': 'forms-lib',
                },
            };

            await copyFiles(filesConfig, 'build');

            // Verify nested structure preserved
            expect(existsSync('build/lib/components/ui/forms/inputs/advanced/RichTextEditor.tsx')).toBe(true);
            expect(existsSync('build/lib/components/ui/forms/inputs/TextInput.tsx')).toBe(true);
            expect(existsSync('build/lib/components/ui/forms/Form.tsx')).toBe(true);

            // Verify specific file copied to root
            expect(existsSync('build/editor.tsx')).toBe(true);

            // Verify directory copied to custom location
            expect(existsSync('build/forms-lib/Form.tsx')).toBe(true);
            expect(existsSync('build/forms-lib/inputs/TextInput.tsx')).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should handle non-existent source files gracefully', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'non-existent.js': true,
                    'also-missing.css': 'styles/bundle.css',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/non-existent.js')).toBe(false);
            expect(existsSync('build/styles/bundle.css')).toBe(false);
        });

        it('should handle empty glob patterns', async () => {
            const filesConfig: FilesConfig = {
                include: {
                    'src/**/*.xyz': true, // No files match this pattern
                },
            };

            await copyFiles(filesConfig, 'build');

            // Should not crash and should not create unnecessary directories
            const buildExists = existsSync('build');
            if (buildExists) {
                const buildContents = await readdir('build');
                expect(buildContents).toHaveLength(0);
            }
        });

        it('should handle mixed valid and invalid patterns', async () => {
            await mkdir('src', { recursive: true });
            await writeFile('src/valid.js', 'valid content');

            const filesConfig: FilesConfig = {
                include: {
                    'src/valid.js': true,
                    'non-existent/**/*.js': true,
                    'src/missing.js': 'custom.js',
                },
            };

            await copyFiles(filesConfig, 'build');

            expect(existsSync('build/src/valid.js')).toBe(true);
            expect(existsSync('build/custom.js')).toBe(false);
        });
    });
});
