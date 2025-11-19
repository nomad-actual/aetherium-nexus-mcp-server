import fs from 'fs/promises';
import path from 'path';
import { Ollama } from 'ollama'
import { ingest } from './ingestor/ingestor.ts';
import { getConfig } from '../utils/config.ts';
import { AetheriumConfig } from '../types.ts';
import { getRagDatastore } from './database/datastore.ts';

// todo: move to some AI client module
const ollamaClient = new Ollama({ host: getConfig().llmClient.host })

async function findFiles(fp: string, config: AetheriumConfig) {
    const fileObjs = await fs.readdir(fp, { withFileTypes: true, recursive: true })

    return fileObjs.filter(file => {
        const okSoFar = file.isFile() && !config.rag.ignoreDirs.some(dir => file.parentPath.includes(dir))
    
        if (!okSoFar) {
            return false
        }

        const fileExt = path
            .extname(file.name)
            .toLowerCase()
        
        return config.rag.supportedFileExts.includes(fileExt)
    })
}

async function crawlAllDirs(config: AetheriumConfig) {
    const allFiles = []

    for (const dir of config.rag.directoriesToIngest) {
        const files = await findFiles(dir, config)
        allFiles.push(...files)
    }

    return allFiles
}

export async function buildEmbeddings(config: AetheriumConfig) {
    console.log(config.rag)

    const files = await crawlAllDirs(config)
    const ragDataStore = await getRagDatastore(config)

    let fileCounter = 0
    for (const file of files) {
        const filePath = path.join(file.parentPath, file.name)

        fileCounter++
        console.log('Processing file', file.name, fileCounter, files.length - 1)

        const chunked = await ingest(filePath)
        if (!chunked.length) {
            continue;
        }

        const embeddingBatch = []

        for (let i = 0; i < chunked.length; i++) {
            const toProcess = chunked[i]
            let embeddings

            try {
                embeddings = await ollamaClient.embed({
                    model: config.llmClient.embeddingModel,
                    input: toProcess,
                    truncate: false,
                    options: {
                        num_ctx: config.llmClient.embeddingModelContext,
                    },
                })

                embeddingBatch.push({
                    content: toProcess,
                    vector: embeddings.embeddings[0],
                    uri: `file://${filePath}`,
                })

                console.log(`${i} / ${(chunked.length - 1) || 1} (chunk size: ${toProcess.length})`)
            } catch (e) {
                console.error(`Error processing file: ${filePath}`, e)
                console.error('text chunk length', toProcess.length)
            }
        }

        await ragDataStore.batchSaveEmbeddings(embeddingBatch)
    }
}

const config = getConfig()

buildEmbeddings(config)
    .then(() => console.log('done'))
    .catch((err) => console.error(err))
