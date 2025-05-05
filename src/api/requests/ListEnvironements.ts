export interface ListEnvironmentsRequest {
    projectId: string;
}

export interface ListEnvironmentsResponse {
    id: string;
    project_id: string;
    name: string;
    slug: string;
    description?: string;
    inherit_members: boolean;
    created_at: string;
    updated_at: string;
}
