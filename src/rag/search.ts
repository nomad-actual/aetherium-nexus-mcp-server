import { Ollama } from 'ollama'
import { AetheriumConfig, RagSearchResult } from '../types.js'
import { getConfig } from '../utils/config.js';
import { formatDuration } from '../utils/formatter.js';
import { getRagDatastore } from './database/datastore.js';

const ollamaClient = new Ollama({ host: getConfig().llmClient.host  })


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

async function makeEmbedding(userQuery: string, config: AetheriumConfig): Promise<number[][]> {
    const ollamaSearchInstruction = 
        `Instruct: Given a user search request, retrieve relevant passages that answer the query.\nQuery: ${userQuery}`

    // note: error on something larger than context size (other option is to truncate)
    // optionally we should break up the query if needed but this is fine for now
    const searchEmbedding = await ollamaClient.embed({
        model: config.llmClient.embeddingModel,
        input: ollamaSearchInstruction,
        truncate: false,
        options: {
            num_ctx: config.llmClient.embeddingModelContext,
        },
    })

    // log stats I guess
    return searchEmbedding.embeddings;
}

async function doSemanticSearch(query: string, config: AetheriumConfig, ragResults: RagSearchResult[]): Promise<RagSearchResult[]> {
    for (const temp of ragResults) {
        const semanticScore = await makeRerankCall(query, temp.content, config)
        temp.metadata.semanticScore = semanticScore
    }

    const finalResults = ragResults.sort((a, b) => {
        if (a.metadata.semanticScore !== b.metadata.semanticScore) {
            return b.metadata.semanticScore - a.metadata.semanticScore
        }

        // sorting by bm25Score has never really yielded great desired results consistently
        // annecdotally it seems to be sort by semantics (by far strongest indicator)
        // followed by vector search...perhaps if those are "close" (like within 0.001) we can do a tie-breaker by bm25Score?

        // else if (a.bm25Score !== b.bm25Score) return b.bm25Score - a.bm25Score

        return b.metadata.cosineSimilarityScore - a.metadata.cosineSimilarityScore
    })

    return finalResults
}

export async function search(query: string, config: AetheriumConfig) {
    if (!query.trim()) {
        console.log('query is empty')
        return []
    } 
    const start = Date.now()
    const ragDataStore = await getRagDatastore(config)
    console.log('Datastore loaded in ', formatDuration(start))

    const baseSearchStart = Date.now()
    const [userQueryVector] = await makeEmbedding(query, config);

    const searchConf = { limit: config.rag.limitResults, sortByClosestMatch: true }
    let basicSearchResults = await ragDataStore.basicSearch(
        query,
        userQueryVector,
        searchConf
    )

    const baseSearchTime = formatDuration(baseSearchStart)

    let finalResults = basicSearchResults
    const semanticStart = Date.now()

    if (config.rag.semanticSearchEnabled) {
        finalResults = await doSemanticSearch(query, config, basicSearchResults)
    }
    const semanticTime = formatDuration(semanticStart)
    

    console.log(
        '----------------------------\n',
        finalResults,
        '\n\n',
        `User Query: "${query}"\n\n`,
        `Basic search duration ${baseSearchTime}\nSemantic time: ${semanticTime}\n`,
        `\nTotal search took ${formatDuration(start)}`,
        '\n\n',
    )

    return finalResults
}

// const config = getConfig()
// const query = 'homelab Hestia'

// search(query, config)
//     .then(() => console.log('done'))
//     .catch((err) => console.error(err))
