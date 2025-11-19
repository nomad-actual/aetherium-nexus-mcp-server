import type { AetheriumConfig, RagSearchResult } from "../../types.ts";
import { JsonRagStore } from "./json.datastore.ts";
import { OpenSearchRagDatastore } from "./opensearch.ts";

export type TempDbEntryMetadata = {
    uri: string,
    embeddingId: string,
}

// this will change but for now it's ok
export type DbEntry = {
    content: string,
    vector: number[],
    metadata: TempDbEntryMetadata,
}

export type TempDataStoreLookupEmbeddingOptions = {
    limit?: number,
    sortByClosestMatch?: boolean,
    minEmbeddingScore?: number,
}

// temp until we do opensearch and maybe others
export interface RagDataStore {
    connect(): Promise<void>;

    // save embedding + metadata
    saveEmbedding(content: string, vector: number[], uri: string): Promise<void>;

    batchSaveEmbeddings(embeddings: { content: string, vector: number[], uri: string }[]): Promise<void>;

    // look up embedding?, get closest matches (up to n results) based on similarity
    lookupEmbedding(searchEmbedding: number[], options: TempDataStoreLookupEmbeddingOptions): Promise<RagSearchResult[]>;

    basicSearch(userQuery: string, userSearchEmbedding: number[], options?: TempDataStoreLookupEmbeddingOptions): Promise<RagSearchResult[]>;
}

// todo move this
let datastore: RagDataStore | null = null;

export async function getRagDatastore(config: AetheriumConfig): Promise<RagDataStore> {
    if (!datastore && config.rag.db.type === 'json') {
        const dbFileLocation = config.rag.db.hostUri.replace('file://', '')
        datastore = new JsonRagStore(dbFileLocation);
    }

    else if (!datastore && config.rag.db.type === 'opensearch') {
        datastore = new OpenSearchRagDatastore(config.rag.db.hostUri)
    }

    if (!datastore) {
        // todo - this cannot happen in the future if auth is set
        // for now this is ok
        throw new Error(`No RagDataStore available for configuration: ${JSON.stringify(config.rag.db)}`)
    }

    await datastore.connect();
    return datastore
}
