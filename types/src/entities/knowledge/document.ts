import { KnowledgeType } from './knowledge';

export enum Subject {
    KnowledgeProcessing = 'knowledge/processing',
    KnowledgeIndexing = 'knowledge/indexing',
    KnowledgeFailed = 'knowledge/error',
    KnowledgeDone = 'knowledge/done',
}

export interface DocumentData {
    created_at: string;
    modified_at: string;
    owner_id: string;
    id: string;
    created_by: string;
    status: Subject;
    documentType: DocumentType;
    type: KnowledgeType;
    source_url: string;
    parsed_url: string;
    title: string;
}

export type CreateDocumentPayload = Omit<
    DocumentData,
    'created_by' | 'parsed_url' | 'status' | 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id'
>;
