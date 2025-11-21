import type { AetheriumConfig, McpToolContent, ReadableWebpageContent } from "../../types.ts";

export interface IScraper {
    shouldAttempt(url: string): boolean;
    scrape(url: string, config: AetheriumConfig, signal: AbortSignal): Promise<any | null>;
    buildResult(contents: ReadableWebpageContent[]): Promise<McpToolContent[]>;
}
