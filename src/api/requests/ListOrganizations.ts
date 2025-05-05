export interface ListOrganizationsResponse {
    id: string;
    name: string;
    slug: string;
    description?: string;
    cloud_storage_bucket: string;
    created_at: string;
    updated_at: string;
}
