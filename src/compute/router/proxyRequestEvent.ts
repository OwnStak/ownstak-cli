export interface ProxyRequestEvent {
    version: string;
    rawPath: string;
    rawQueryString: string;
    headers: Record<string, string>;
    queryStringParameters?: Record<string, string>;
    requestContext: {
        domainName: string;
        domainPrefix: string;
        http: {
            method: string;
            path: string;
            protocol: string;
            sourceIp: string;
            userAgent: string;
        };
    };
    body?: string;
    isBase64Encoded: boolean;
}

export type Event = ProxyRequestEvent;

export function isProxyRequestEvent(event: Event): event is ProxyRequestEvent {
    return event.version === '2.0';
}
