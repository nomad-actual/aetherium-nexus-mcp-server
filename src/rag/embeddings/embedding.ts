export interface EmbeddingProvider {
    embed(texts: string | string[]): Promise<number[][]>
    readonly dimensions: number
}
