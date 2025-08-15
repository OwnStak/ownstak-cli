interface Permissions {
    read: boolean;
    update: boolean;
    delete: boolean;
}

export interface ResolveEnvironmentSlugsResponse extends ResolveProjectSlugResponse {
    environment: {
        id: string;
        slug: string;
        can: Permissions;
    };
}

export interface ResolveEnvironmentCloudBackendSlugsResponse extends ResolveEnvironmentSlugsResponse {
    cloud_backend: {
        id: string;
        slug: string;
        can: Permissions;
    };
}

export interface ResolveProjectSlugResponse extends ResolveOrganizationSlugResponse {
    project: {
        id: string;
        slug: string;
        can: Permissions;
    };
}

export interface ResolveOrganizationSlugResponse {
    organization: {
        id: string;
        slug: string;
        can: Permissions;
    };
}

export interface ResolveOrganizationCloudBackendSlugsResponse extends ResolveOrganizationSlugResponse {
    cloud_backend: {
        id: string;
        slug: string;
        can: Permissions;
    };
}
