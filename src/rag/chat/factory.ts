import { getConfig } from '../../utils/config.ts'
import type { AetheriumConfig } from '../../types.ts'
import type { ChatProvider } from './chat.ts'
import { OpenAICompatibleChatProvider } from './openai-compatible-chat-provider.ts'
import { OllamaChatProvider } from './ollama-chat-provider.ts'

function getChatProviderFromConfig(config: AetheriumConfig): ChatProvider {
    if (config.llmClient.semanticSearchProvider === 'openai') {
        if (!config.llmClient.openaiApiKey) {
            throw new Error('OPENAI_API_KEY is not set but SEMANTIC_SEARCH_PROVIDER=openai')
        }
        return new OpenAICompatibleChatProvider({
            apiKey: config.llmClient.openaiApiKey,
            basePath: config.llmClient.openaiBasePath || undefined,
            defaultModel: config.llmClient.semanticSearchModel,
        })
    }

    if (!config.llmClient.host) {
        throw new Error('LLM_HOST is required for SEMANTIC_SEARCH_PROVIDER=ollama')
    }

    return new OllamaChatProvider({
        host: config.llmClient.host,
        model: config.llmClient.semanticSearchModel,
        contextSize: config.llmClient.semanticSearchModelContext,
    })
}

let cachedProvider: ChatProvider | null = null

export function getChatProvider(config: AetheriumConfig = getConfig()): ChatProvider {
    if (!cachedProvider) {
        cachedProvider = getChatProviderFromConfig(config)
    }
    return cachedProvider
}

export function resetChatProvider(): void {
    cachedProvider = null
}
