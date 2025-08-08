import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ScrapeOptions, ReadableWebpageContent, McpToolContent } from "../../types.js";
import { IScraper } from "./IScraper.js";
import axios from "axios";
import logger from "../../utils/logger.js";


export default class RedditScraper implements IScraper {
    shouldAttempt(url: string): boolean {
        return url.startsWith('https://www.reddit.com') && url.includes('/comments/');
    }

    async scrape(url: string, scrapeOpts: ScrapeOptions): Promise<any | null> {
        const startTime = Date.now();

        const overrideUrl = `${(url.endsWith('/') ? url.slice(0, -1) : url)}.json`
        const resp = await axios.request({
            method: 'GET',
            url: overrideUrl,
            timeout: 5000, // todo: config
        })

        if (resp.status !== 200) {
            logger.error(`Failed to fetch Reddit page at ${url}. Status code: ${resp.status}`)
            return null;
        }

        const data = resp.data || [];

        // so presently
        // there are two listings
        // 0 is main post
        // so
        // content: 0 -> data -> children -> 0 -> selftext
        // title: 0 -> data -> children -> 0 -> title
        // 1 is comments which might be useful to send back

        // determine if reddit data is valid, can always fall back to html
        const mainPosting = data[0]?.data?.children[0]?.data;
        if (!mainPosting) {
            return null
        }

        const author = mainPosting.author;
        const content = mainPosting.selftext;
        const title = `Posted by: ${author}: ${mainPosting.title}`;
        const postedDate = new Date(mainPosting.created_utc * 1000);

        const stuff: ReadableWebpageContent = {
            content,
            title,
            lang: 'Unknown',
            publishedTime: postedDate.toISOString(),
            siteName: 'Reddit',
            url,
            scrapeDuration: `${(Date.now() - startTime) / 1000} seconds`,
        }

        // does not parse replies butmain post is more important for now
        // todo: parse replies
        const comments = data[1]?.data?.children.map((child: any) => {
            const comment = child.data;

            // max length applies here
            const content = comment.body;
            const author = comment.author;
            const commentUrl = `https://www.reddit.com${comment.permalink}`;
            const postedDate = new Date(comment.created_utc * 1000);

            const stuff: ReadableWebpageContent = {
                content,
                title: `Comment author: ${author}`,
                lang: 'Unknown',
                publishedTime: postedDate.toISOString(),
                siteName: 'Reddit',
                url: commentUrl,
                scrapeDuration: `${(Date.now() - startTime) / 1000} seconds`,
            }

            return stuff
        })

        return [stuff, ...comments]
    }

    // todo: parse a number of levels deep
    parseComments(comments: ReadableWebpageContent[]): McpToolContent[]  {
        return comments.map((comment) => {
            const commentContent = 
                `Reddit comment for: ${
                    comment.url
                } Date Published: ${
                    comment?.publishedTime
                } Comment Content: ${
                    comment.content
                }`

            return { type: 'text', text: commentContent }
        })
    }

    async buildResult(contents: ReadableWebpageContent[], scrapeOpts: ScrapeOptions): Promise<McpToolContent[]> {
        const [redditData] = contents
        const comments = contents.slice(1)

        const metadata = 
        `Main Content for: ${
            redditData.url
        } Language: ${
            redditData?.lang || '(Not found)'
        } Date Published: ${
            redditData?.publishedTime
        } Site Name: ${
            redditData?.siteName
        } Title: ${
            redditData?.title
        } Scrape Duration (sec): ${redditData.scrapeDuration}`

        const result: any[] = [
            { type: 'text', text: metadata },
            { type: 'text', text: JSON.stringify(redditData || '') },
            { type: 'text', text: '--- Comments for post follow from here ---' },
            ...this.parseComments(comments),
        ]

        return result
    }
}