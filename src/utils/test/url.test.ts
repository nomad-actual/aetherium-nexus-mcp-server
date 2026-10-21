import test from 'ava'
import { stripUrlUserinfo } from '../url.ts'

test('stripUrlUserinfo removes username and password', (t) => {
    t.is(stripUrlUserinfo('http://user:pass@example.com/page?q=1'), 'http://example.com/page?q=1')
})

test('stripUrlUserinfo removes username-only and password-only userinfo', (t) => {
    t.is(stripUrlUserinfo('http://user@example.com/'), 'http://example.com/')
    t.is(stripUrlUserinfo('http://:pass@example.com/'), 'http://example.com/')
})

test('stripUrlUserinfo leaves URLs without userinfo unchanged', (t) => {
    t.is(stripUrlUserinfo('https://example.com/a?b=c#d'), 'https://example.com/a?b=c#d')
})

test('stripUrlUserinfo is idempotent', (t) => {
    const once = stripUrlUserinfo('http://user:pass@example.com/')
    t.is(stripUrlUserinfo(once), once)
})

test('stripUrlUserinfo returns unparseable strings unchanged', (t) => {
    t.is(stripUrlUserinfo('not a url'), 'not a url')
    t.is(stripUrlUserinfo(''), '')
})
