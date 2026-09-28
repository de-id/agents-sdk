/**
 * Result of a knowledge-base query against the Knowledge API.
 * @internal The SDK exposes no knowledge methods; manage knowledge through the D-ID API.
 */
export interface QueryResult {
    documentIds: string[];
    result: any;
    matches: any;
}
