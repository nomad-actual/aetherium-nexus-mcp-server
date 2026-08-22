import { Ollama } from 'ollama'
import type { EmbeddingProvider } from './embedding.ts'

export class OllamaEmbeddingProvider implements EmbeddingProvider {
    readonly dimensions: number

    private client: Ollama
    private model: string
    private contextSize: number

    constructor(host: string, model: string, contextSize: number = 512) {
        this.client = new Ollama({ host })
        this.model = model
        this.contextSize = contextSize
        this.dimensions = contextSize
    }

    async embed(texts: string | string[]): Promise<number[][]> {
        const input = Array.isArray(texts) ? texts : [texts]
        const response = await this.client.embed({
            model: this.model,
            input,
            truncate: true,
            options: {
                num_ctx: this.contextSize,
            },
        })
        return response.embeddings
    }
}
