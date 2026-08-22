import OpenAI, { type ClientOptions } from 'openai'
import type { EmbeddingProvider } from './embedding.ts'

const KNOWN_MODEL_DIMENSIONS: Record<string, number> = {
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
}

type OpenAICompatibleConfig = {
    apiKey: string
    model: string
    dimensions?: number
    encodingFormat?: 'float' | 'base64'
    basePath?: string
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
    readonly dimensions: number

    private client: OpenAI
    private model: string
    private encodingFormat: 'float' | 'base64'

    constructor(config: OpenAICompatibleConfig) {
        const clientConfig: ClientOptions = {
            apiKey: config.apiKey,
        }

        if (config.basePath) {
            clientConfig.baseURL = config.basePath.replace(/\/$/, '')
        }

        this.client = new OpenAI(clientConfig)
        this.model = config.model
        this.encodingFormat = config.encodingFormat ?? 'float'
        this.dimensions = config.dimensions ?? KNOWN_MODEL_DIMENSIONS[this.model] ?? 0
    }

    async embed(texts: string | string[]): Promise<number[][]> {
        const input = Array.isArray(texts) ? texts : [texts]
        const params: OpenAI.EmbeddingCreateParams = {
            model: this.model,
            input,
            encoding_format: this.encodingFormat,
        }

        if (this.dimensions > 0) {
            params.dimensions = this.dimensions
        }

        const response = await this.client.embeddings.create(params)
        return response.data.map(item => item.embedding)
    }
}
