export type ChatMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export type ChatResponse = {
    content: string
}

export interface ChatProvider {
    chat(messages: ChatMessage[], model: string): Promise<ChatResponse>
}
