import { access } from 'fs/promises';
import { createWriteStream } from 'fs';
import archiver from 'archiver';

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

/**
 * Zips a folder into a zip archive with files at the root.
 * Unlike adm-zip package, this function uses async archiver
 * that doesn't block the event loop, so we can still show progress in the console.
 * @param dir Directory to zip
 * @param outputFile Output file path
 * @returns Promise that resolves when the zip is created
 */
export async function zipFolder(dir: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const outputStream = createWriteStream(outputFile);
        const archive = archiver('zip', {
            zlib: { level: 6 }, // Sets the compression level
        });

        archive.on('error', (err: Error) => {
            reject(new Error(`Failed to create zip archive: ${err.message}`));
        });

        archive.directory(dir, false);
        archive.finalize();

        outputStream.on('close', resolve);
        archive.on('end', resolve);

        archive.pipe(outputStream);
    });
}
