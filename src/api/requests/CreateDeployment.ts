export interface CreateDeploymentRequest {
    cli_version: string;
    framework?: string;
    runtime: string;
    memory: number;
    timeout: number;
    arch: string;
}

export interface CreateDeploymentResponse {
    id: string;
    environment_id: string;
    build_number: string;
    created_at: string;
    updated_at: string;
    status: string;
    storage_urls: {
        compute: string;
        assets: string;
        permanent_assets: string;
    };
}
