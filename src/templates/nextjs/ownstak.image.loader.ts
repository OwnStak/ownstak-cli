/**
 * This is a custom image loader for Next.js that replaces the built-in /_next/image optimizer
 * with OwnStak Image Optimizer in ownstak-proxy.
 * NOTE: This code runs in both browser and node.js environments,
 * so don't use any browser or node.js specific APIs here.
 * @returns
 */
export default function ImageLoader({ src, width, height, quality }: { src: string; width?: number; height?: number; quality?: number }) {
    const searchParams = new URLSearchParams();
    searchParams.set('url', src);
    if (width) searchParams.set('w', width.toString());
    if (height) searchParams.set('h', height.toString());
    if (quality) searchParams.set('q', quality.toString());

    // NOTE: Do not import the INTERNAL_PATH_PREFIX constant here,
    // to keep this code as small as possible without any dependencies.
    return `/__ownstak__/image?${searchParams.toString()}`;
}
