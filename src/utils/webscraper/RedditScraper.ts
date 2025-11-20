import type { ScrapeOptions, ReadableWebpageContent, McpToolContent } from "../../types.ts";
import { type IScraper } from "./IScraper.ts";
import axios from "axios";
import logger from "../../utils/logger.ts";


type RedditPost = {
    id: string,
    title: string,
    author: string,
    url: string,
    content: string,
    createdUtc: Date,
    comments: RedditComment[]
}


type RedditComment = {
    id: string
    parentId: string
    author: string
    createdUtc: Date
    content: string
    upVotes: number
    downVotes: number
}





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
            timeout: scrapeOpts.timeout,
            signal: scrapeOpts.signal
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
        const mainPosting = (this.unwrapRedditObj(data[0]) || [])[0]?.data;
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
            meta: {
                // todo: add scores to eliminate if we need to 
                // flag that this might not be very reputable
            }
        }

        // does not parse replies but main post is more important for now
        // todo: parse replies

        const scrapedComments = this.scrapeComments(this.unwrapRedditObj(data[1]), { maxCommentDepth: 5, level: 0 })

        return [stuff, ...scrapedComments]
    }

    private unwrapRedditObj(redditListing: any) {
        return redditListing?.data?.children || redditListing?.data?.replies || []
    }

    private scrapeComments(commentList: any[], commentScrapeOpts: { level: number, maxCommentDepth: number}): ReadableWebpageContent[] {
        if (!Array.isArray(commentList) || commentList.length === 0 || commentScrapeOpts.level >= commentScrapeOpts.maxCommentDepth) {
            return []
        }
        const originalStart = Date.now()
        const comments: ReadableWebpageContent[] = []

        // unwrap because each comment is an object like { kind: string, data: object }
        for (const { data: comment } of commentList) {
            // todo: escape urls or any injection paths if body does not already do so
            // todo: configurable max comment content
            let content = (comment.body as string).trim().substring(0, 1000)
            if (comment.score < 0) {
                content = '(omitted - bad score)'
            }

            const rc: ReadableWebpageContent = {
                content,
                title: `Reply author: ${comment.author}`,
                lang: '',
                publishedTime: new Date(comment.created_utc * 1000).toISOString(),
                siteName: 'Reddit',
                url: `https://www.reddit.com${comment.permalink}`,
                scrapeDuration: `${(Date.now() - originalStart) / 1000} seconds`,
                meta: {
                    author: comment.author,
                    ups: comment.ups as number,
                    downs: comment.downs as number,
                    score: comment.score as number,
                    replies: [] as ReadableWebpageContent[]
                }
            }
            
            const replies = this.unwrapRedditObj(comment.replies)
            const children = this.scrapeComments(replies, { ...commentScrapeOpts, level: commentScrapeOpts.level + 1 })

            // highest ranked only (max of say 5)
            // children.sort((a, b) => b.meta.score - a.meta.score).slice(0, 5)

            rc.meta.replies = children
                .sort((a, b) => b.meta.score - a.meta.score)
                .slice(0, 5)

            comments.push(rc)
        }

        return comments
    }


    private formatReply(reply: ReadableWebpageContent) {
        const replies = this.getReplies(reply)
                .map(r => this.formatReply(r))
                .join('\n\n')
                .trim()

        const basic = `Author: ${reply.meta.author} Published: ${reply.publishedTime}
        Content: ${reply.content}`
        
        if (!replies) {
            return basic
        }
        
        return `${basic}
            Replies:
                ${replies || 'None'}`
    }

    private getReplies(rwc: ReadableWebpageContent) {
        return (rwc.meta.replies || []) as ReadableWebpageContent[]
    }

    async buildResult(contents: ReadableWebpageContent[], scrapeOpts: ScrapeOptions): Promise<McpToolContent[]> {
        const [redditData] = contents
        const comments = contents
            .slice(1)
            .map((comment) => ({ type: 'text', text: this.formatReply(comment) }))

        const metadata = 
        `Content for: ${
            redditData.url
        } Date Published: ${
            redditData.publishedTime
        } Site: ${
            redditData.siteName
        } Title: ${
            redditData.title
        } Scrape Duration (sec): ${redditData.scrapeDuration}`

        const result: any[] = [
            { type: 'text', text: metadata },
            { type: 'text', text: JSON.stringify(redditData || '') },
            { type: 'text', text: '--- Comments ---' },
            ...comments,
        ]

        return result
    }
}