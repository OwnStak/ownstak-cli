import { Client } from './Client.js';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { HEADERS } from '../constants.js';
import { Transform } from 'stream';

export interface UploadOptions {
    onProgress?: (percentage: number) => void;
}

export async function uploadToPresignedUrl(fullUrl: string, filePath: string, options: UploadOptions = {}) {
    const url = new URL(fullUrl);

    const client = new Client(`${url.protocol}//${url.host}`, {
        [HEADERS.ContentType]: 'application/octet-stream',
    });

    const { size: fileSize } = await stat(filePath);
    // Read the file from the file system as chunked stream.
    // The file can have up to 2GB, so we need to keep memory usage low.
    const fileStream = createReadStream(filePath);

    let uploadedFileSize = 0;
    let uploadedFilePercentage = 0;

    const passThroughFileStream = new Transform();
    passThroughFileStream._transform = (chunk, _encoding, callback) => {
        uploadedFileSize += chunk.length;
        const percentage = Math.round((uploadedFileSize / fileSize) * 100);

        // Call the onProgress callback only if the percentage has changed
        if (percentage !== uploadedFilePercentage) {
            options.onProgress?.(percentage);
            uploadedFilePercentage = percentage;
        }

        callback(null, chunk);
    };
    // Pipe the file stream to the pass through stream
    // that cals the percentage progress of the upload.
    fileStream.pipe(passThroughFileStream);

    return client.put({
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: {
            [HEADERS.ContentLength]: fileSize.toString(),
        },
        body: passThroughFileStream,
    });
}
