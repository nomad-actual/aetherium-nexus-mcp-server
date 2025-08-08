import { McpToolContent, ReadableWebpageContent, ScrapeOptions } from "../../types.js";


export interface IScraper {
    shouldAttempt(url: string): boolean;
    scrape(url: string, scrapeOpts: ScrapeOptions): Promise<any | null>;
    buildResult(contents: ReadableWebpageContent[], scrapeOpts: ScrapeOptions): Promise<McpToolContent[]>;
}
