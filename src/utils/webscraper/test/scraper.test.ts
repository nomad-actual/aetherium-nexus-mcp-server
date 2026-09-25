import test from 'ava'
import BasicHtmlScraper from '../BasicHtmlScraper.ts'
import CrwScraper from '../CrwScraper.ts'
import type { McpToolContent, ReadableWebpageContent } from '../../../types.ts'

const basic = new BasicHtmlScraper()
const crw = new CrwScraper()

test('BasicHtmlScraper.shouldAttempt: accepts a normal html page', (t) => {
    t.true(basic.shouldAttempt('https://example.com/article'))
})

test('BasicHtmlScraper.shouldAttempt: rejects binary file extensions case-insensitively', (t) => {
    t.false(basic.shouldAttempt('https://example.com/file.pdf'))
    t.false(basic.shouldAttempt('https://example.com/archive.zip'))
    t.false(basic.shouldAttempt('https://example.com/image.PNG'))
})

test('BasicHtmlScraper.shouldAttempt: rejects js-heavy spa domains', (t) => {
    t.false(basic.shouldAttempt('https://www.instagram.com/p/abc123'))
    t.false(basic.shouldAttempt('https://tiktok.com/@user/video/1'))
    t.false(basic.shouldAttempt('https://twitter.com/user/status/1'))
    t.false(basic.shouldAttempt('https://x.com/user/status/1'))
})

test('CrwScraper.shouldAttempt: accepts http and https urls', (t) => {
    t.true(crw.shouldAttempt('https://example.com/article'))
    t.true(crw.shouldAttempt('http://example.com'))
})

test('CrwScraper.shouldAttempt: rejects non-http(s) urls', (t) => {
    t.false(crw.shouldAttempt('not a url'))
    t.false(crw.shouldAttempt('ftp://example.com/file'))
})

test('CrwScraper.shouldAttempt: rejects binary file extensions', (t) => {
    t.false(crw.shouldAttempt('https://example.com/file.png'))
})

function makeContent(overrides: Partial<ReadableWebpageContent> = {}): ReadableWebpageContent {
    return {
        url: 'https://example.com/article',
        title: 'Example Article',
        lang: 'en',
        content: 'Some content',
        siteName: 'Example',
        publishedTime: '2026-01-15',
        scrapeDuration: '0.42',
        meta: {},
        ...overrides,
    }
}

function textOf(block: McpToolContent): string {
    return block.type === 'text' ? block.text : ''
}

test('BasicHtmlScraper.buildResult: returns metadata and content blocks', async (t) => {
    const result = await basic.buildResult([makeContent()])
    t.is(result.length, 2)
    t.is(result[0].type, 'text')
    t.regex(textOf(result[0]), /Content for: https:\/\/example\.com\/article/)
    t.regex(textOf(result[0]), /Title: Example Article/)
    t.regex(textOf(result[0]), /Scrape Duration \(sec\): 0\.42/)
    t.is(textOf(result[1]), 'Some content')
})

test('CrwScraper.buildResult: includes the crw status code in metadata', async (t) => {
    const result = await crw.buildResult([makeContent({ meta: { statusCode: 200 } })])
    t.is(result.length, 2)
    t.regex(textOf(result[0]), /CRW Status: 200/)
    t.is(textOf(result[1]), 'Some content')
})

test('CrwScraper.buildResult: reports an unknown crw status when metadata is missing', async (t) => {
    const result = await crw.buildResult([makeContent()])
    t.regex(textOf(result[0]), /CRW Status: Unknown/)
})
