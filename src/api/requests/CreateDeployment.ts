export interface CreateDeploymentRequest {
    cli_version: string;
    framework?: string;
    runtime: string;
    memory: number;
    timeout: number;
    arch: string;
}
