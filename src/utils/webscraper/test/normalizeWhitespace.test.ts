import test from 'ava'
import { normalizeWhitespace } from '../normalizeWhitespace.ts'

test('line whitespace: strips trailing spaces and tabs from lines', (t) => {
    t.is(normalizeWhitespace('line one   \nline two\t\n'), 'line one\nline two')
})

test('line whitespace: collapses mid-line space and tab runs to a single space', (t) => {
    t.is(normalizeWhitespace('a     b\t\tc'), 'a b c')
})

test('line whitespace: collapses leading indentation runs to a single space', (t) => {
    t.is(normalizeWhitespace('1. item\n    continued text\n- other'), '1. item\n continued text\n- other')
})

test('line whitespace: collapses table cell padding', (t) => {
    t.is(
        normalizeWhitespace('| a   | b |\n| --- | --- |\n| c   | d |'),
        '| a | b |\n| --- | --- |\n| c | d |',
    )
})

test('blank lines: collapses 3+ consecutive newlines to a paragraph break', (t) => {
    t.is(normalizeWhitespace('a\n\n\n\nb'), 'a\n\nb')
})

test('blank lines: turns whitespace-only lines into blank lines', (t) => {
    t.is(normalizeWhitespace('a\n   \nb'), 'a\n\nb')
})

test('blank lines: turns tab-only lines into blank lines', (t) => {
    t.is(normalizeWhitespace('a\n\t\nb'), 'a\n\nb')
})

test('line endings: normalizes CRLF to LF', (t) => {
    t.is(normalizeWhitespace('a\r\nb'), 'a\nb')
})

test('line endings: normalizes lone CR to LF', (t) => {
    t.is(normalizeWhitespace('a\r b'), 'a\n b')
})

test('unicode: converts non-breaking spaces to regular spaces', (t) => {
    t.is(normalizeWhitespace('a\u00a0\u00a0b and lone\u00a0c'), 'a b and lone c')
})

test('unicode: removes zero-width and invisible characters', (t) => {
    t.is(normalizeWhitespace('a\u200bb\u200cc\u200dd\ufeffe\u00adf'), 'abcdef')
})

test('code blocks: preserves whitespace inside fenced code blocks', (t) => {
    const input = 'before\n\n```\n    indented   code\t\n| a   | b |\n```\n\nafter'
    t.is(normalizeWhitespace(input), input)
})

test('code blocks: preserves whitespace inside tilde fences', (t) => {
    t.is(normalizeWhitespace('~~~\n  x   y\n~~~'), '~~~\n  x   y\n~~~')
})

test('code blocks: preserves the rest of the text when a fence is never closed', (t) => {
    t.is(normalizeWhitespace('intro\n```\n   code  line'), 'intro\n```\n   code  line')
})

test('code blocks: ignores other fence characters inside a code block', (t) => {
    t.is(
        normalizeWhitespace('```\n~~~ not a fence\n   keep   this\n```'),
        '```\n~~~ not a fence\n   keep   this\n```',
    )
})

test('code blocks: preserves fence info strings and indented content', (t) => {
    t.is(
        normalizeWhitespace('```ts\nconst x =    1;\n\ttabbed   line\n```'),
        '```ts\nconst x =    1;\n\ttabbed   line\n```',
    )
})

test('code blocks: recognizes indented fences (up to 3 leading spaces)', (t) => {
    const input = 'intro\n\n   ```\n    a   b\n   ```\n\noutro'
    t.is(normalizeWhitespace(input), input)
})

test('code blocks: preserves multiple fenced code blocks', (t) => {
    const input = '```\n  one  \n```\n\nmiddle   text\n\n~~~\n  two  \n~~~'
    t.is(normalizeWhitespace(input), '```\n  one  \n```\n\nmiddle text\n\n~~~\n  two  \n~~~')
})

test('code blocks: normalizes prose directly adjacent to a code block', (t) => {
    t.is(
        normalizeWhitespace('before   text\n```\n  code  \n```\nafter   text'),
        'before text\n```\n  code  \n```\nafter text',
    )
})

test('code blocks: normalizes CRLF line endings inside code blocks', (t) => {
    t.is(normalizeWhitespace('```\na\r\nb   \r\n```'), '```\na\nb   \n```')
})

test('document edges: returns empty string for empty input', (t) => {
    t.is(normalizeWhitespace(''), '')
})

test('document edges: trims leading and trailing whitespace', (t) => {
    t.is(normalizeWhitespace('  \n  hello  \n  '), 'hello')
})

test('document edges: strips a trailing whitespace-only line', (t) => {
    t.is(normalizeWhitespace('foo\n\t'), 'foo')
})

test('document edges: is idempotent', (t) => {
    const input = 'Title   here\t\n\nFirst   para.\n\n\n\n| k   | v |\n\n```js\nconst x =    1;\n```\n\nEnd.'
    const once = normalizeWhitespace(input)
    t.is(normalizeWhitespace(once), once)
})
