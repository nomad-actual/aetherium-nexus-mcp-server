import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
const tokenEncoder = new Tiktoken(o200k_base);


export type ChunkingOptions = {
    chunkSize: number;
    chunkOverlap: number;
    method: 'paragraph' | 'sentence' | 'word' | 'line'
}

function getPrev(chunks: string[], overlap: number) {
    if (overlap === 0) return ''
    if (chunks.length === 0) return ''

    return chunks[chunks.length - 1].slice(-overlap)
}

function getTotalLen(s1: string, s2: string): number {
    return tokenEncoder.encode(s1).length + tokenEncoder.encode(s2).length
}

function combineChunks(chunks: string[], options: ChunkingOptions): string[] {
    const combined = []
    let temp = ''

    const totalTokens = options.chunkSize - options.chunkOverlap

    for (let i = 0; i < chunks.length; i += 2) {
        const sentence = `${chunks[i]}${chunks[i+1] || ''}`

        if (getTotalLen(temp, sentence) > totalTokens) {
            const prev = getPrev(combined, options.chunkOverlap)
            combined.push(`${prev}${temp}`)
            temp = sentence
        } else {
            temp += `${sentence} `
        }
    }

    // handle leftover text
    if (temp.length > 0) {
        const prev = getPrev(combined, options.chunkOverlap)
        combined.push(`${prev}${temp}`)
    }

    return combined.filter(c => !!c.trim())
}


function demoteMethod(method: string): 'paragraph' | 'sentence' | 'word' | 'line' {
    if (method === 'paragraph') return 'sentence';
    if (method === 'sentence') return 'word';
    if (method === 'word') return 'line';
    
    return 'line';
}

function getSplitter(method: string): string {
    if (method === 'paragraph') return '\n{2,}';
    if (method === 'sentence') return "([.!?\\n])\\s*" //or others
    if (method === 'word') return "\\s*"
    if (method === 'line') return '\n'

    return ' '
}

export function chunkText(text: string, options: ChunkingOptions): string[] {
    const splitter = getSplitter(options.method)
    const earlyChunks = text.split(new RegExp(splitter))
    const results: string[] = []

    // separate paragraphs into sentences if length is > chunksize
    earlyChunks.forEach((chunk) => {
        if (getTotalLen(chunk, '') > options.chunkSize) {
            console.log(`chunking into ${options.method}`, chunk.length)
            const demotedChunks = chunkText(chunk, {
                ...options,
                method: demoteMethod(options.method)
            })

            // combine into large enough chunks
            const combined = combineChunks(demotedChunks, options)
            results.push(...combined)
        } else if (chunk.length === 1) {
            // do nothing
        } else {
            results.push(chunk)
        }
    })

    return results
}