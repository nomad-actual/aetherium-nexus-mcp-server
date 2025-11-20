import type { ScrapeOptions, ReadableWebpageContent, McpToolContent } from "../../types.ts";
import { type IScraper } from "./IScraper.ts";
import axios from "axios";
import logger from "../../utils/logger.ts";


export default class RedditScraper implements IScraper {
    shouldAttempt(url: string): boolean {
        return url.startsWith('https://www.reddit.com') && url.includes('/comments/');
    }

    private catchTimeCrash(s: number, stuff: any): string {
        try {
            return new Date(s).toISOString()
        } catch (e) {
            logger.warn({ message: "Error parsing date:", error: e, stuff })
        }
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

        // determine if reddit data is valid, can always fall back to html
        const mainPosting = (this.unwrapRedditObj(data[0]) || [])[0]?.data;
        if (!mainPosting) {
            return null
        }

        const author = mainPosting.author;
        const content = mainPosting.selftext;
        const title = mainPosting.title;
        const postedDate = this.catchTimeCrash(mainPosting.created_utc * 1000, mainPosting);

        const stuff: ReadableWebpageContent = {
            content,
            title,
            lang: '', // kinda useless
            publishedTime: postedDate,
            siteName: 'Reddit',
            url,
            scrapeDuration: `${(Date.now() - startTime) / 1000} seconds`,
            meta: {
                author,
                score: mainPosting.score || 0,
                ups: mainPosting.ups || 0,
                downs: mainPosting.downs || 0,
                upvoteRatio: mainPosting.upvote_ratio,
            }
        }

        const comments = this.unwrapRedditObj(data[1])

        // todo config - top comments
        const topComments = this.getTopVotedMax(comments, 30)
        
        // todo config max comment depth
        const scrapedComments = this.scrapeComments(topComments, { maxCommentDepth: 5 })

        return [stuff, ...scrapedComments]
    }

    private unwrapRedditObj(redditListing: any) {
        return redditListing?.data?.children || redditListing?.data?.replies || []
    }


    // this is a naive sorting and will filter out negatively-started threads
    // but this will potentially miss good conversations at 1-level deeper
    // potential improvement ^
    private getTopVotedMax(redditListing: any[], maxComments: number): any[] {
        return redditListing
            .filter(l => !this.shouldOmitComment(l)) // note the !
            .sort((a, b) => b.data.score - a.data.score)
            .slice(0, maxComments)
    }

    private shouldOmitComment(comment: any): boolean {
        const wrongType = comment.kind === 'more'
        if (wrongType) {
            return true
        }
        
        // removed content
        const commentContent = (comment.data.body || '').trim()
        const deletedOrRemovedContent = [
            '[removed]',
            '[deleted]'
        ].some((s) => s === commentContent)
        
        return deletedOrRemovedContent
    }

    private scrapeComments(commentList: any[], commentScrapeOpts: { maxCommentDepth: number}, level?: number): ReadableWebpageContent[] {
        const safeLevel = level || 0

        if (!Array.isArray(commentList) || commentList.length === 0 || safeLevel >= commentScrapeOpts.maxCommentDepth) {
            return []
        }

        const originalStart = Date.now()
        const comments: ReadableWebpageContent[] = []

        // unwrap because each comment is an object like { kind: string, data: object }
        for (const dataObj of commentList) {
            if (this.shouldOmitComment(dataObj)) {
                continue
            }

            const { data: comment } = dataObj 
            // todo: escape urls or any injection paths if body does not already do so
            // todo: configurable max comment content
            // possible chunk similar to RAG max length to end of sentence chunking
            let content = ((comment.body || '') as string).substring(0, 1000).trim()

            if (comment.score < 0) {
                content = '(omitted - bad score)'
            }

            const replyPosted = this.catchTimeCrash(comment.created_utc * 1000, comment)

            const rc: ReadableWebpageContent = {
                content,
                title: `Reply author: ${comment.author}`,
                lang: '',
                publishedTime: replyPosted,
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
            const children = this.scrapeComments(replies, { ...commentScrapeOpts }, safeLevel + 1)

            // consider highest ranked only in each reply thread
            // also consider an aggregate scoring
            // children.sort((a, b) => b.meta.score - a.meta.score).slice(0, 5)
            rc.meta.replies = children
                .sort((a, b) => b.meta.score - a.meta.score)
                // the deeper we go, the fewer high-ranking comments we want
                .slice(0, Math.max(commentScrapeOpts.maxCommentDepth - safeLevel, 1))

            comments.push(rc)
        }

        return comments
    }


    private formatReply(reply: ReadableWebpageContent) {
        const replies = this.getReplies(reply)
                .map(r => this.formatReply(r))
                .join('\n\n')

        const basic = 
`
Author: ${reply.meta.author}
Published: ${reply.publishedTime}
Score: ${reply.meta.score}
Content: ${reply.content}`
        
        if (!replies) {
            return basic
        }
        
        return `${basic}
Replies:
    ${replies}
`
    }

    private getReplies(rwc: ReadableWebpageContent) {
        return (rwc.meta.replies || []) as ReadableWebpageContent[]
    }

    async buildResult(contents: ReadableWebpageContent[], scrapeOpts: ScrapeOptions): Promise<McpToolContent[]> {
        const [redditData] = contents
        const comments = contents
            .slice(1)
            .map((comment) => ({ type: 'text', text: this.formatReply(comment).trim() }))

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