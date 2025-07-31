import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReadableWebpageContent, ScrapeOptions } from "../../types";


export interface IScraper {
    shouldAttempt(url: string): boolean;
    scrape(url: string, scrapeOpts: ScrapeOptions): Promise<any | null>;
    buildResult(contents: ReadableWebpageContent[], scrapeOpts: ScrapeOptions): Promise<CallToolResult>;
}
