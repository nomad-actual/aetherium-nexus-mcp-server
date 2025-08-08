import fs from 'fs/promises'
import { Ollama } from 'ollama'
import { AetheriumConfig, RagSearchQuery, RagSearchResult, RagSearchResultMetadata } from '../types.js'
import { cosineSimilarity } from "fast-cosine-similarity";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import { getConfig } from '../utils/config.js';

const ollamaClient = new Ollama({ host: 'http://ollama.homelab.ist:11434' })

let fakeDb: DbEntry[] = []

type DbEntry = {
    content: string,
    vector: number[],
    metadata: {
        filePath: string,
        embeddingId: number,
    }
}

async function getFakeDb(): Promise<DbEntry[]> {
    if (!Object.keys(fakeDb).length) {
        const file = await fs.readFile('./embeddings.json', 'utf-8')
        const jsonEmbeddings = JSON.parse(file)
        fakeDb = jsonEmbeddings;
    }

    return fakeDb;
}

async function makeRerankCall(userQuery: string, chunk: string, config: AetheriumConfig) {
    const rerankQuery =
`You are an expert relevance grader. Your task is to evaluate if the 
following document is relevant to the user's query. 
Answer a with a "yes" or "no" based on how similar the document is to the query.

Query: ${userQuery}
Document: ${chunk}
`

// Uses the Qwen3 Reranker to score the relevance of a document to a query.
// Returns a score of 1.0 for 'Yes' and 0.0 for 'No'.

    const response = await ollamaClient.chat({
        model: config.llmClient.semanticSearchModel,
        messages: [{ role: 'user', content: rerankQuery }],
        stream: false,
        format: {
            "type": "object",
            "properties": {
                "answer": { "type": "string" },
            },
            "required": [
                "answer",
            ]
        },
        options: {
            num_ctx: config.llmClient.semanticSearchModelContext,
            temperature: 0 // for deterministic results
        }
    })

    try {
        const answer = response.message.content.trim()
        const parsedAnswer = JSON.parse(answer).answer.toLowerCase()

        return parsedAnswer === 'yes' ? 1 : 0
    } catch (error) {
        console.error('Error processing rerank response:', error, response)
        return 0
    }
}

async function makeEmbedding(userQuery: string, embeddingModel: string, maxContext: number): Promise<number[][]> {
    const ollamaSearchInstruction = 
        `Instruct: Given a user search request, retrieve relevant passages that answer the query.\nQuery: ${userQuery}`

    // note: error on something larger than context size (other option is to truncate)
    // optionally we should break up the query if needed but this is fine for now
    const searchEmbedding = await ollamaClient.embed({
        model: embeddingModel,
        input: ollamaSearchInstruction,
        truncate: false,
        options: {
            num_ctx: maxContext,
        },
    })

    // log stats I guess
    return searchEmbedding.embeddings;
}

async function getBm25Results(entries: DbEntry[], userQuery: string): Promise<RagSearchResult[]> {
    const bm25Docs = entries.map(entry => {
        return {
            pageContent: entry.content,
            metadata: {
                uri: `file://${entry.metadata.filePath}`,
                vector: entry.vector,
                cosineSimilarityScore: 0,
                semanticScore: 0,
                embeddingId: entry.metadata.embeddingId,
            }
        }
    })

    const engineOpts = {
        k: entries.length,
        includeScore: true
    }

    const bm25Engine = BM25Retriever.fromDocuments(bm25Docs, engineOpts)
    const bmResults = await bm25Engine.invoke(userQuery)

    return bmResults.map(result => {
        return {
            content: result.pageContent,
            metadata: { ...result.metadata } as RagSearchResultMetadata,
        }
    })
}


async function doVectorSearch(query: string, config: AetheriumConfig, ragResults: RagSearchResult[]): Promise<RagSearchResult[]> {
    const userQueryVector = await makeEmbedding(
        query,
        config.llmClient.embeddingModel,
        config.llmClient.embeddingModelContext
    );
    
    const vectorResults: RagSearchResult[] = ragResults.map(entry => {
        const score = cosineSimilarity(userQueryVector[0], entry.metadata.vector)
        
        return {
            content: entry.content,
            metadata: {
                uri: entry.metadata.uri || '',
                cosineSimilarityScore: score,
                bm25Score: entry.metadata.bm25Score || 0,
                semanticScore: 0,
                embeddingId: entry.metadata.embeddingId || '',
                vector: []
            }
        }
    })

    return vectorResults.sort((a, b) => {
        return b.metadata.cosineSimilarityScore - a.metadata.cosineSimilarityScore
    })
}

async function doSemanticSearch(query: string, config: AetheriumConfig, ragResults: RagSearchResult[]): Promise<RagSearchResult[]> {
    for (const temp of ragResults) {
        const semanticScore = await makeRerankCall(query, temp.content, config)
        temp.metadata.semanticScore = semanticScore
    }

    // not a fan but don't wanna copy
    return ragResults
}

function getDurationDisplay(start: number): string {
    return ((Date.now() - start) / 1000).toFixed(2) + 's'
}

export async function search(query: string, config: AetheriumConfig) {
    if (!query.trim()) {
        console.log('query is empty')
        return []
    }
    const start = Date.now()
    const db = await getFakeDb()

    console.log('loaded db in', getDurationDisplay(start))

    // consider doing in parallel by adding embedding chunkId to metadata so
    // filePath + embedding chunkId is really unique so concurrent updates can be done easily to a map of id -> metadata

    const bm25Start = Date.now()
    const bm25Results = await getBm25Results(db, query)
    const bm25Time = getDurationDisplay(bm25Start)

    const vectorStart = Date.now()
    const vectorResults = await doVectorSearch(query, config, bm25Results)
    const vectorTime = getDurationDisplay(vectorStart)

    console.log('\nbm25 results', bm25Results.slice(0, 3), '\n')
    console.log('\nvector results', vectorResults.slice(0, 3), '\n')

    const reducedVectorResults = vectorResults.slice(0, config.rag.limitResults)

    let results = reducedVectorResults;
    let semanticTime = 'Not enabled';
    if (config.rag.semanticSearchEnabled) {
        const semanticStart = Date.now()
        results = await doSemanticSearch(query, config, reducedVectorResults)
        semanticTime = getDurationDisplay(semanticStart)
    }
    

    const finalResults = results.sort((a, b) => {
        if (a.metadata.semanticScore !== b.metadata.semanticScore) {
            return b.metadata.semanticScore - a.metadata.semanticScore
        }

        // sorting by bm25Score has never really yielded great desired results consistently
        // annecdotally it seems to be sort by semantics (by far strongest indicator)
        // followed by vector search...perhaps if those are "close" (like within 0.001) we can do a tie-breaker by bm25Score?

        // else if (a.bm25Score !== b.bm25Score) return b.bm25Score - a.bm25Score

        return b.metadata.cosineSimilarityScore - a.metadata.cosineSimilarityScore
    })

    console.log(
        '----------------------------\n',
        finalResults,
        '\n\n',
        `User Query: "${query}"\n\n`,
        `BM25 time: ${bm25Time}\nVector time: ${vectorTime}\nSemantic time: ${semanticTime}\n`,
        `\nTotal search took ${getDurationDisplay(start)} seconds`,
        '\n\n',
    )

    return finalResults
}

// todo: config / userQuery
const config = getConfig()
const query = ''

search(query, config)
    .then(() => console.log('done'))
    .catch((err) => console.error(err))
