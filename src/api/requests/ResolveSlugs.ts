interface Permissions {
    read: boolean;
    update: boolean;
    delete: boolean;
}

export interface ResolveEnvironmentSlugsResponse {
    organization: {
        id: string;
        slug: string;
        can: Permissions;
    };
    project: {
        id: string;
        slug: string;
        can: Permissions;
    };
    environment: {
        id: string;
        slug: string;
        can: Permissions;
    };
}
