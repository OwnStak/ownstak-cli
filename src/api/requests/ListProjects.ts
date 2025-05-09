export interface ListProjectsResponse {
    id: string;
    name: string;
    slug: string;
    description?: string;
    inherit_members: boolean;
    organization_id: string;
    created_at: string;
    updated_at: string;
}
