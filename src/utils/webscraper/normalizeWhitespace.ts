const LINE_ENDINGS = /\r\n?/g
const NON_BREAKING_SPACE = /\u00a0/g
const INVISIBLE_CHARS = /[\u200b\u200c\u200d\ufeff\u00ad]/g
const TRAILING_LINE_WS = /[ \t]+\n/g
const WS_RUNS = /[ \t]+/g
const WS_ONLY_LINE = /^ $/gm
const BLANK_LINE_RUNS = /\n{3,}/g
const FENCE_START = /^ {0,3}(`{3,}|~{3,})/

type Segment = { code: boolean; lines: string[] }

function cleanText(segment: string): string {
    return segment
        .replace(TRAILING_LINE_WS, '\n')
        .replace(WS_RUNS, ' ')
        .replace(WS_ONLY_LINE, '')
        .replace(BLANK_LINE_RUNS, '\n\n')
}

export function normalizeWhitespace(text: string): string {
    if (!text) return ''

    const normalized = text
        .replace(LINE_ENDINGS, '\n')
        .replace(NON_BREAKING_SPACE, ' ')
        .replace(INVISIBLE_CHARS, '')

    const lines = normalized.split('\n')
    const segments: Segment[] = []
    let current: Segment | null = null
    let inCode = false
    let fenceChar = ''

    for (const line of lines) {
        const fence = FENCE_START.exec(line)
        const char = fence ? fence[1][0] : ''

        let codeLine: boolean
        if (fence && !inCode) {
            inCode = true
            fenceChar = char
            codeLine = true
        } else if (fence && inCode && char === fenceChar) {
            inCode = false
            codeLine = true
        } else {
            codeLine = inCode
        }

        if (!current || current.code !== codeLine) {
            current = { code: codeLine, lines: [] }
            segments.push(current)
        }
        current.lines.push(line)
    }

    return segments
        .map((seg) => (seg.code ? seg.lines.join('\n') : cleanText(seg.lines.join('\n'))))
        .join('\n')
        .trim()
}
