import { DocumentType, KnowledgeType } from './knowledge';

/**
 * Lifecycle status of a document, as served by the knowledge API. The API stores the
 * status as a prefixed event subject (`document/done`) but strips the prefix on read,
 * so the wire value is always bare.
 */
export type DocumentStatus = 'created' | 'processed' | 'done' | 'rejected' | 'error';

/**
 * @deprecated The knowledge API has never served these prefixed values — it strips the
 * subject prefix on read. Use `DocumentStatus` instead. Kept for backwards compatibility
 * and will be removed in the next major.
 */
export enum Subject {
    KnowledgeProcessing = 'knowledge/processing',
    KnowledgeFailed = 'knowledge/error',
    KnowledgeDone = 'knowledge/done',
}

export interface DocumentData {
    created_at: string;
    modified_at: string;
    owner_id: string;
    id: string;
    created_by: string;
    status: DocumentStatus;
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
