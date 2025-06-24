import type { Request, Response } from '../../compute/router/index.js';

// This function transforms all relative URLs poting to /_next/image to absolute URLs,
// so the Next.js image loader works correctly and doesn't try to load assets on local file system.
export default function nextjsImageTransform(req: Request, _res: Response) {
    if (!req.path.startsWith('/_next/image')) return;

    try {
        const imageUrl = req.getQuery('url');
        if (!imageUrl) return;

        const absoluteImageUrl = new URL(imageUrl, req.url);
        req.setQuery('url', absoluteImageUrl.toString());
    } catch (e: any) {
        throw new Error(`Failed to transform relative image URL to absolute URL: ${e.message}`);
    }
}
