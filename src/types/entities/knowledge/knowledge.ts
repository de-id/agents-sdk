/**
 * Kind of a knowledge entity as stored by the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export enum KnowledgeType {
    Knowledge = 'knowledge',
    Document = 'document',
    Record = 'record',
}

/**
 * File format of a document ingested into the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export enum DocumentType {
    Pdf = 'pdf',
    Text = 'text',
    Html = 'html',
    Word = 'word',
    Json = 'json',
    Markdown = 'markdown',
    Csv = 'csv',
    Excel = 'excel',
    Powerpoint = 'powerpoint',
    Archive = 'archive',
    Image = 'image',
    Audio = 'audio',
    Video = 'video',
}

/**
 * Result of parsing a document's raw content for the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface IParserResult {
    data: string;
}

/**
 * A knowledge entity as returned by the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export interface KnowledgeData {
    created_at: string;
    modified_at: string;
    owner_id: string;
    id: string;
    created_by: string;
    type: KnowledgeType;
    vector_store: string;
    description: string;
    name: string;
    starter_message?: string[];
}

/**
 * Request payload for creating a knowledge entity, derived from `KnowledgeData`.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 * @deprecated Not intended for consumers. Removed from the package exports in the next major.
 */
export type KnowledgePayload = Omit<
    KnowledgeData,
    'created_by' | 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id'
>;
