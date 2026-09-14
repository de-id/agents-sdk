import { DocumentType, KnowledgeType } from './knowledge';

/**
 * Lifecycle status of a document, as served by the knowledge API. The API stores the
 * status as a prefixed event subject (`document/done`) but strips the prefix on read,
 * so the wire value is always bare.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type DocumentStatus = 'created' | 'processed' | 'done' | 'rejected' | 'error';

/**
 * Prefixed event-subject form of a document's lifecycle status.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated The knowledge API has never served these prefixed values — it strips the
 * subject prefix on read. Use `DocumentStatus` instead. Kept for backwards compatibility
 * and will be removed in the next major.
 */
export enum Subject {
    KnowledgeProcessing = 'knowledge/processing',
    KnowledgeFailed = 'knowledge/error',
    KnowledgeDone = 'knowledge/done',
}

/**
 * A document as returned by the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
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

/**
 * Request payload for creating a document, derived from `DocumentData`.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type CreateDocumentPayload = Omit<
    DocumentData,
    'created_by' | 'parsed_url' | 'status' | 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id'
>;
