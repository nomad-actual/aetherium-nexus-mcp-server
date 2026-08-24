import { Ollama } from 'ollama'
import type { ChatMessage, ChatProvider, ChatResponse } from './chat.ts'

type OllamaChatConfig = {
    host: string
    model: string
    contextSize: number
}

export class OllamaChatProvider implements ChatProvider {
    private client: Ollama
    private model: string
    private contextSize: number

    constructor(config: OllamaChatConfig) {
        this.client = new Ollama({ host: config.host })
        this.model = config.model
        this.contextSize = config.contextSize
    }

    async chat(messages: ChatMessage[], model: string): Promise<ChatResponse> {
        const response = await this.client.chat({
            model: model || this.model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            stream: false,
            options: {
                num_ctx: this.contextSize,
                temperature: 0,
            },
        })

        return { content: response.message.content }
    }
}
