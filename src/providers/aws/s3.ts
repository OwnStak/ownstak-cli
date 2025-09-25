import { createReadStream } from 'fs';
import { stat, readdir } from 'fs/promises';
import type Stream from 'stream';
import { Transform } from 'stream';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { join, relative } from 'path';
import type { Logger } from '../../logger.js';
import * as mime from 'mime-types';
import pLimit from 'p-limit';

/**
 * Upload a file to S3
 */
export async function uploadToS3({
    region,
    client,
    bucket,
    key,
    filePath,
    onProgress,
}: {
    region: string;
    client?: S3Client;
    bucket: string;
    key: string;
    filePath: string;
    onProgress?: (percentage: number) => void;
}): Promise<void> {
    const s3Client = client || new S3Client({ region });
    let fileStream: Stream.Readable = createReadStream(filePath);
    const { size: fileSize } = await stat(filePath);

    if (onProgress) {
        let uploadedSize = 0;
        const trackingStream = new Transform({
            transform(chunk, _, cb) {
                uploadedSize += chunk.length;
                const percentage = Math.round((uploadedSize / fileSize) * 100);
                onProgress?.(percentage);
                cb(null, chunk);
            },
        });
        fileStream = fileStream.pipe(trackingStream);
    }

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentLength: fileSize,
        ContentType: mime.lookup(filePath) || 'application/octet-stream',
        Body: fileStream,
    });

    await s3Client.send(command);
}

/**
 * Upload a directory to S3 recursively
 */
export async function uploadDirectoryToS3({
    region,
    bucket,
    prefix,
    localDir,
    onProgress,
    concurrency = 10,
}: {
    region: string;
    bucket: string;
    prefix: string;
    localDir: string;
    concurrency?: number;
    onProgress?: (percentage: number) => void;
}): Promise<void> {
    const limit = pLimit(concurrency);
    const s3Client = new S3Client({ region });
    // Recursively collect all file paths
    const collectFiles = async (folder: string): Promise<{ path: string; name: string }[]> => {
        const entries = await readdir(folder, { withFileTypes: true });
        const result: { path: string; name: string }[] = [];

        for (const entry of entries) {
            const fullPath = join(folder, entry.name);
            if (entry.isDirectory()) {
                result.push(...(await collectFiles(fullPath)));
                continue;
            }
            result.push({
                path: fullPath,
                name: relative(localDir, fullPath), // preserve folder structure
            });
        }
        return result;
    };

    const files = await collectFiles(localDir);
    let uploadedFiles = 0;

    const uploads = files.map((file) =>
        limit(async () => {
            await uploadToS3({ region, client: s3Client, bucket, key: `${prefix}/${file.name}`, filePath: file.path });
            uploadedFiles++;
            onProgress?.(Math.round((uploadedFiles / files.length) * 100));
        }),
    );

    await Promise.all(uploads);
}

/**
 * List objects in S3 bucket with prefix
 */
export async function listS3Objects(awsRegion: string, bucket: string, prefix: string): Promise<string[]> {
    const s3Client = new S3Client({ region: awsRegion });
    const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
    });

    const response = await s3Client.send(command);
    return response.Contents?.map((obj: any) => obj.Key || '') || [];
}

/**
 * Delete objects from S3
 */
export async function deleteS3Objects({ region, bucket, keys }: { region: string; bucket: string; keys: string[] }): Promise<void> {
    const s3Client = new S3Client({ region });

    const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
            Objects: keys.map((key) => ({ Key: key })),
        },
    });
    await s3Client.send(command);
}

export async function deleteS3ObjectsByCondition({
    region,
    logger,
    bucket,
    condition,
    prefix = '',
}: {
    region: string;
    logger: Logger;
    bucket: string;
    prefix: string;
    condition: (key: string) => boolean;
}): Promise<void> {
    const s3Client = new S3Client({ region });

    let nextContinuationToken: string | undefined;

    while (true) {
        const command = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: nextContinuationToken,
        });

        const response = await s3Client.send(command);

        const keys = response.Contents?.map((obj: any) => obj.Key || '') || [];
        const keysToDelete = keys.filter(condition);
        logger.debug(`Deleting ${keysToDelete.length} objects from S3 bucket ${bucket} with prefix ${prefix}`);
        if (keysToDelete.length > 0) {
            await deleteS3Objects({ region, bucket, keys: keysToDelete });
        }

        if (!response.IsTruncated) {
            break;
        }

        nextContinuationToken = response.NextContinuationToken;
    }
}
