import { randomUUID } from 'node:crypto';

/**
 * Generates a base64 encoded ID of the specified length.
 * @param length - The length of the ID to generate.
 * @returns A base64 encoded ID of the specified length.
 */
export function generateBase64Id(length: number = 16) {
    return Buffer.from(randomUUID()).toString('base64').slice(0, length);
}
