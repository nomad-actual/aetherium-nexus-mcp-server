import { cosineSimilarity } from "fast-cosine-similarity";
import type { DbEntry, RagDataStore, TempDataStoreLookupEmbeddingOptions } from "./datastore.ts";
import fs from 'fs/promises';
import type { RagSearchResult, RagSearchResultMetadata } from "../../types.ts";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";

export class JsonRagStore implements RagDataStore {
    private static fakeDb: DbEntry[] = [];
    private readonly dbFileLocation: string;
     
    constructor(dbFileLocation: string) {
        // don't do this here...do it in the config on load
        this.dbFileLocation = dbFileLocation.replace('file://', '');
    }

    private async fileExists(fp: string): Promise<boolean> {
        return fs.access(fp)
            .then(() => true)
            .catch(() => false);
    }

    private async createFile(fp: string) {
        const fileExists = await this.fileExists(fp);

        if (!fileExists) {
            console.log('Creating JSON-backed RAG store at', fp)
            await fs.writeFile(fp, '[]', { flag: 'w+' , flush: true, encoding: 'utf-8' });
        }
    }

    async connect(): Promise<void> {
        if (!JsonRagStore.fakeDb.length) {
            // no-op if exists - could opt to erase on connect though
            await this.createFile(this.dbFileLocation);

            const file = await fs.readFile(this.dbFileLocation, 'utf-8')
            JsonRagStore.fakeDb = JSON.parse(file);
        }
    }

    async saveEmbedding(content: string, vector: number[], uri: string): Promise<void> {
        JsonRagStore.fakeDb.push({
            content,
            vector,
            metadata: {
                uri,
                embeddingId: crypto.randomUUID()
            } 
        })

        await fs.writeFile(this.dbFileLocation, JSON.stringify(JsonRagStore.fakeDb), 'utf-8')
    }

    async batchSaveEmbeddings(embeddings: { content: string, vector: number[], uri: string }[]): Promise<void> {
        JsonRagStore.fakeDb.push(...embeddings.map(e => ({
            ...e,
            metadata: {
                uri: e.uri,
                embeddingId: crypto.randomUUID()
            } 
        })))

        await fs.writeFile(this.dbFileLocation, JSON.stringify(JsonRagStore.fakeDb), 'utf-8')
    }


    // really just emulating what something like opensearch would do
    // it's just convenient to put it here
    async basicSearch(userQuery: string, userSearchEmbedding: number[], options?: TempDataStoreLookupEmbeddingOptions): Promise<RagSearchResult[]> {
        const bm25Docs = JsonRagStore.fakeDb
            .filter(entry => !!entry.vector)
            .map(entry => {
                const vectorScore = cosineSimilarity(userSearchEmbedding, entry.vector)

                return {
                    pageContent: entry.content,
                    metadata: {
                        uri: entry.metadata.uri,
                        cosineSimilarityScore: vectorScore,
                        semanticScore: 0,
                        embeddingId: entry.metadata.embeddingId,
                    }
                }
            })

        const engineOpts = {
            k: JsonRagStore.fakeDb.length,
            includeScore: true
        }

        const bm25Engine = BM25Retriever.fromDocuments(bm25Docs, engineOpts)
        const bmResults = await bm25Engine.invoke(userQuery)

        let temp = bmResults.map(result => ({
            content: result.pageContent,
            metadata: { ...result.metadata } as RagSearchResultMetadata,
        }))

        // sort by cosine similarity score
        if (options?.sortByClosestMatch) {
            temp = temp.sort((a, b) => b.metadata.cosineSimilarityScore - a.metadata.cosineSimilarityScore)
        }

        if ( options?.limit) {
            temp = temp.slice(0, options.limit)
        }

        return temp
    }

    async lookupEmbedding(searchEmbedding: number[], options: TempDataStoreLookupEmbeddingOptions): Promise<RagSearchResult[]> {
        let vectorResults: RagSearchResult[] = JsonRagStore.fakeDb.map(entry => {
            const score = cosineSimilarity(searchEmbedding, entry.vector)
            
            return {
                content: entry.content,
                metadata: {
                    uri: entry.metadata.uri || '',
                    cosineSimilarityScore: score,
                    semanticScore: 0,
                    embeddingId: entry.metadata.embeddingId || '',
                    vector: [] // not needed after this
                }
            }
        })

        // note: this might be adjustable anywhere
        if (options.minEmbeddingScore) {
            vectorResults = vectorResults.filter(r => r.metadata.cosineSimilarityScore >= (options.minEmbeddingScore || 0))
        }

        if (options.sortByClosestMatch) {
            vectorResults = vectorResults.sort((a, b) => {
                return b.metadata.cosineSimilarityScore - a.metadata.cosineSimilarityScore
            })
        }

        if (Number(options.limit) > 0) {
            return vectorResults.slice(0, options.limit)
        }

        return vectorResults;
    }

}