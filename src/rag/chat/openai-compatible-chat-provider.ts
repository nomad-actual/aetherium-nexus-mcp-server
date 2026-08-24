import OpenAI, { type ClientOptions } from 'openai'
import type { ChatMessage, ChatProvider, ChatResponse } from './chat.ts'

type OpenAIChatConfig = {
    apiKey: string
    basePath?: string
    defaultModel: string
}

export class OpenAICompatibleChatProvider implements ChatProvider {
    private client: OpenAI

    constructor(config: OpenAIChatConfig) {
        const clientConfig: ClientOptions = {
            apiKey: config.apiKey,
        }

        if (config.basePath) {
            clientConfig.baseURL = config.basePath.replace(/\/$/, '')
        }

        this.client = new OpenAI(clientConfig)
    }

    async chat(messages: ChatMessage[], model: string): Promise<ChatResponse> {
        const response = await this.client.chat.completions.create({
            model,
            messages: messages.map(m => ({ role: m.role as any, content: m.content })),
            stream: false,
            response_format: { type: 'json_object' },
        })

        const content = response.choices[0]?.message.content ?? ''
        return { content }
    }
}
