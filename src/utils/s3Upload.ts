import { Client } from './Client.js';
import fs from 'fs/promises';

export async function uploadToPresignedUrl(fullUrl: string, filePath: string) {
    const url = new URL(fullUrl);

    const client = new Client(`${url.protocol}//${url.host}`, {
        'Content-Type': 'application/octet-stream',
    });
    const fileBuffer = await fs.readFile(filePath);

    return client.put({
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: {
            'Content-Length': fileBuffer.length.toString(),
        },
        body: fileBuffer,
    });
}
