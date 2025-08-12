import { RagSearchResult } from "../../types.js";
import { RagDataStore, TempDataStoreLookupEmbeddingOptions } from "./datastore.js";
import { Client } from '@opensearch-project/opensearch'

export class OpensearchRagDatastore implements RagDataStore {
    private readonly client: Client;
    private readonly indexName = 'aetherium-nexus-rag';
    // private readonly vectorIndexName = 'aetherium-nexus-rag-vector';

    // todo: need to add the vector store configs
    // index type knn_vector, index dimensionality (maps to embedding model)

    constructor(host: string) {
        this.client = new Client({
            node: host,
            
        })
    }



    async connect(): Promise<void> {
        const isIndexCreated = (await this.client.indices.exists({ index: this.indexName })).body

        if (!isIndexCreated) {
            await this.client.indices.create({
                index: this.indexName,
                body: {
                    settings: {
                        "index.knn": true,
                    },
                    mappings: {
                        properties: {
                            ragVector: {
                                type: "knn_vector",
                                dimension: 2560,
                            },
                        },
                    }
                }
            });
            // await this.client.indices.create({
            //     index: this.vectorIndexName,
            //     body: {
            //         settings: {
            //             "index.knn": true,
            //         },
            //         mappings: {
            //             properties: {
            //                 vector: {
            //                     type: "knn_vector",
            //                     dimension: 2560,
            //                 },
            //             },
            //         }
            //     }
            // });
        }
    }



    async saveEmbedding(content: string, vector: number[], uri: string): Promise<void> {
        await this.client.index({
            index: this.indexName,
            id: crypto.randomUUID(),
            body: {
                content,
                ragVector: vector,
                uri,
                embeddingId: crypto.randomUUID(),
            },
        });
    }

    async batchSaveEmbeddings(embeddings: { content: string; vector: number[]; uri: string; }[]): Promise<void> {
        for (const { content, vector, uri } of embeddings) {
            await this.saveEmbedding(content, vector, uri);
        }

        // is this needed for single as well?
        await this.client.indices.refresh({ index: this.indexName });
    }

    lookupEmbedding(searchEmbedding: number[], options: TempDataStoreLookupEmbeddingOptions): Promise<RagSearchResult[]> {
        throw new Error("Method not implemented.");
    }

    async basicSearch(userQuery: string, userSearchEmbedding: number[], options?: TempDataStoreLookupEmbeddingOptions): Promise<RagSearchResult[]> {
        console.log('limit', options?.limit)
        const results = await this.client.search({
            index: this.indexName,
            body: {
                size: options?.limit || 10, // bad to have a default limit, but for now...
                query: {
                    // todo: also pass in query query for text search as well

                    knn: {
                        ragVector: {
                            vector: userSearchEmbedding,
                            k: options?.limit || 10 // bad to have a default limit, but for now...
                        }
                    }
                }
            },
        })

        return results.body.hits.hits.map((hit) => {
            const openSearchResult = hit._source
            const cosineSimilarityScore = Number(hit._score) || 0

            return {
                content: hit._source?.content as string,
                metadata: {
                    uri: openSearchResult?.uri as string,
                    cosineSimilarityScore,
                    // we don't need to return this...it shouldn't be a part of the results
                    vector: [],
                    bm25Score: 0,
                    embeddingId: hit._source?.embeddingId as string,
                    semanticScore: 0
                }
            }

        })
    }
}

