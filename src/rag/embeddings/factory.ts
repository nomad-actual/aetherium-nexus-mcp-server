import { getConfig } from '../../utils/config.ts'
import type { AetheriumConfig } from '../../types.ts'
import type { EmbeddingProvider } from './embedding.ts'
import { OpenAICompatibleEmbeddingProvider } from './openai-compatible-provider.ts'
import { OllamaEmbeddingProvider } from './ollama-provider.ts'

function getEmbeddingProviderFromConfig(config: AetheriumConfig): EmbeddingProvider {
    if (config.llmClient.embeddingProvider === 'openai') {
        if (!config.llmClient.openaiApiKey) {
            throw new Error('OPENAI_API_KEY is not set but EMBEDDING_PROVIDER=openai')
        }
        return new OpenAICompatibleEmbeddingProvider({
            apiKey: config.llmClient.openaiApiKey,
            model: config.llmClient.openaiEmbeddingModel,
            dimensions: config.llmClient.openaiDimensions || undefined,
            encodingFormat: (config.llmClient.openaiEncodingFormat as 'float' | 'base64') || 'float',
            basePath: config.llmClient.openaiBasePath || undefined,
        })
    }

    if (!config.llmClient.embeddingModel) {
        throw new Error('EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama')
    }
    if (!config.llmClient.host) {
        throw new Error('LLM_HOST is required when EMBEDDING_PROVIDER=ollama')
    }

    return new OllamaEmbeddingProvider(
        config.llmClient.host,
        config.llmClient.embeddingModel,
        config.llmClient.embeddingModelContext,
    )
}

let cachedProvider: EmbeddingProvider | null = null

export function getEmbeddingProvider(config: AetheriumConfig = getConfig()): EmbeddingProvider {
    if (!cachedProvider) {
        cachedProvider = getEmbeddingProviderFromConfig(config)
    }
    return cachedProvider
}

export function resetEmbeddingProvider(): void {
    cachedProvider = null
}
