export enum KnowledgeType {
    Knowledge = 'knowledge',
    Document = 'document',
    Record = 'record',
}

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

export interface IParserResult {
    data: string;
}

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

export type KnowledgePayload = Omit<
    KnowledgeData,
    'created_by' | 'type' | 'created_at' | 'modified_at' | 'id' | 'owner_id'
>;
