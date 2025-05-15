export type ApiDeployment = {
    id: string;
    environment_id: string;
    build_number: string;
    created_at: string;
    updated_at: string;
    status: string;
    links: { backend: string; type: 'environment' | 'deployment'; url: string }[];
    console_url: string;
    cloud_backend_deployments: {
        id: string;
        status: string;
        cloud_backend: {
            id: string;
            name: string;
            slug: string;
        };
    }[];
};

export type ApiDeploymentOnCreate = ApiDeployment & {
    storage_urls: {
        compute: string;
        assets: string;
        permanent_assets: string;
    };
};
