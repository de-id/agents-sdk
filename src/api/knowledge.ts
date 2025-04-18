import {
    Auth,
    CreateDocumentPayload,
    DocumentData,
    KnowledgeData,
    KnowledgePayload,
    QueryResult,
    RecordData,
} from '$/types/index';
import { didApiUrl } from '../config/environment';
import { createClient } from './apiClient';

export function createKnowledgeApi(auth: Auth, host = didApiUrl, onError?: (error: Error, errorData: object) => void) {
    const client = createClient(auth, `${host}/knowledge`, onError);

    return {
        createKnowledge(payload: KnowledgePayload, options?: RequestInit) {
            return client.post<KnowledgeData>(`/`, payload, options);
        },
        getKnowledgeBase(options?: RequestInit) {
            return client.get<KnowledgeData[]>(`/`, options);
        },
        getKnowledge(knowledgeId: string, options?: RequestInit) {
            return client.get<KnowledgeData>(`/${knowledgeId}`, options);
        },
        deleteKnowledge(knowledgeId: string, options?: RequestInit): Promise<any> {
            return client.delete(`/${knowledgeId}`, undefined, options);
        },
        createDocument(knowledgeId: string, payload: CreateDocumentPayload, options?: RequestInit) {
            return client.post<DocumentData>(`/${knowledgeId}/documents`, payload, options);
        },
        deleteDocument(knowledgeId: string, documentId: string, options?: RequestInit) {
            return client.delete(`/${knowledgeId}/documents/${documentId}`, undefined, options);
        },
        getDocuments(knowledgeId: string, options?: RequestInit) {
            return client.get<DocumentData[]>(`/${knowledgeId}/documents`, options);
        },
        getDocument(knowledgeId: string, documentId: string, options?: RequestInit) {
            return client.get<DocumentData>(`/${knowledgeId}/documents/${documentId}`, options);
        },
        getRecords(knowledgeId: string, documentId: string, options?: RequestInit) {
            return client.get<RecordData[]>(`/${knowledgeId}/documents/${documentId}/records`, options);
        },
        query(knowledgeId: string, query: string, options?: RequestInit) {
            return client.post<QueryResult>(`/${knowledgeId}/query`, { query }, options);
        },
    };
}

export type KnowledegeApi = ReturnType<typeof createKnowledgeApi>;
