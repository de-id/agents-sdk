import { KnowledgeType } from './knowledge';

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

export type CreateRecordPayload = Omit<
    RecordData,
    'created_by' | 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id'
>;
