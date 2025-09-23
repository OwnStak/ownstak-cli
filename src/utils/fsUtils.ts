import { access } from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import archiver from 'archiver';
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { Transform } from 'stream';

/**
 * Async version of fs.existsSync
 * @param path Path to check
 * @returns Promise that resolves to true if path exists, false otherwise
 */
export async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Format bytes to a human-readable string
 * @param bytes Number of bytes to format
 * @returns Formatted string with units (B, KB, MB, GB, TB)
 */
export function formatBytes(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let index = 0;
    let size = bytes;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index++;
    }
    return `${size.toFixed(2)} ${units[index]}`;
}

export interface ZipFolderOptions {
    onProgress?: (percentage: number) => void;
    compressLevel?: number;
}

/**
 * Zips a folder into a zip archive with files at the root.
 * Unlike adm-zip package, this function uses async archiver
 * that doesn't block the event loop, so we can still show progress in the console.
 * @param dir Directory to zip
 * @param outputFile Output file path
 * @returns Promise that resolves when the zip is created
 */
export async function zipFolder(dir: string, outputFile: string, options: ZipFolderOptions = {}): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const outputStream = createWriteStream(outputFile);
        const archive = archiver('zip', {
            zlib: { level: options.compressLevel ?? 6 },
        });

        archive.on('error', (err: Error) => {
            reject(new Error(`Failed to create zip archive: ${err.message}`));
        });

        // Recursively collect all file paths and calculate total size
        const collectFiles = async (folder: string): Promise<{ path: string; size: number; name: string }[]> => {
            const entries = await readdir(folder, { withFileTypes: true });
            const result: { path: string; size: number; name: string }[] = [];

            for (const entry of entries) {
                const fullPath = join(folder, entry.name);
                if (entry.isDirectory()) {
                    result.push(...(await collectFiles(fullPath)));
                    continue;
                }
                const { size } = await stat(fullPath);
                result.push({
                    path: fullPath,
                    size,
                    name: relative(dir, fullPath), // preserve folder structure in zip
                });
            }
            return result;
        };

        const fileStats = await collectFiles(dir);
        const totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);
        let processedSize = 0;

        // Append each file with progress tracking
        for (const { path, name } of fileStats) {
            const fileStream = createReadStream(path);
            const trackingStream = new Transform({
                transform(chunk, _, cb) {
                    processedSize += chunk.length;
                    options.onProgress?.(Math.round((processedSize / totalSize) * 100));
                    cb(null, chunk);
                },
            });
            archive.append(fileStream.pipe(trackingStream), { name });
        }

        archive.pipe(outputStream);
        outputStream.on('close', resolve);
        archive.finalize();
    });
}
