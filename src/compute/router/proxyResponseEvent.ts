export interface ProxyResponseEvent {
    statusCode: number;
    headers?: Record<string, string>;
    multiValueHeaders?: Record<string, string[]>;
    body?: string;
    isBase64Encoded?: boolean;
}
