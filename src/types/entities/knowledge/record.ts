import { KnowledgeType } from './knowledge';

/**
 * A record (chunk of a document) as returned by the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface RecordData {
    created_at: string;
    modified_at: string;
    owner_id: string;
    id: string;
    created_by: string;

    type: KnowledgeType;
    embedding_id: string;
    start_index: number;
    source_url: string;
    title: string;
    data: string;
}

/**
 * Request payload for creating a record, derived from `RecordData`.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type CreateRecordPayload = Omit<
    RecordData,
    'created_by' | 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id'
>;
