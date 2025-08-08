import fs from 'fs/promises';
import path from "node:path";
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
const tokenEncoder = new Tiktoken(o200k_base);

import { MarkdownTextSplitter } from "@langchain/textsplitters"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { chunkText } from "../../utils/text.chunker.js";

// todo config
const chunkOverlapPercent = 0.10
const chunkSize = 500
const chunkOverlap = Math.floor(chunkSize * chunkOverlapPercent);


// future improvements:
// - convert to html and use the structure to more easily parse
//
// - semantic chunking is expensive but perhaps useful if it eliminates the 
//   need for semantic searching at the end


export async function ingest(filePath: string): Promise<string[]> {
    const fileExt = path.extname(filePath).toLowerCase();

    console.log('Ingesting file:', filePath)

    // todo: just object with file ext -> function
    if (fileExt.toLowerCase() === '.md') {
        return ingestMarkdown(filePath);
    }

    if (fileExt.toLowerCase() === '.pdf') {    
        return ingestPdf(filePath);
    }

    // todo: 
    // .txt
    // .doc, .docx, (open office), .pptx, .epub, etc

    return []
}


async function ingestMarkdown(filePath: string): Promise<string[]> {
    // notes for future improvements (from https://www.reddit.com/r/Rag/comments/1lcqw1x/embeddingschunking_for_markdown_content/)

    // Don't split tables at all - treat each table as a single chunk (by way of using html)
    // You can detect markdown tables by looking for the pipe characters and header separators.

    // For regular text, use semantic chunking instead of just character count. Look 
    // into using sentence transformers to group related sentences together.

    // When you do chunk tables, preserve the header row in each chunk. So if 
    // you have a massive table, each chunk should start with the column headers.

    // Consider converting markdown tables to a more structured format before 
    // embedding - like JSON or even just comma separated values. Tables in 
    // markdown are meant for display, not for semantic search.
    const markdownTextSplitter = new MarkdownTextSplitter({
        chunkSize,
        chunkOverlap,
        lengthFunction: (text) => tokenEncoder.encode(text).length
    })
    
    const markdownText = await fs.readFile(filePath, 'utf-8');
    const markdownChunks = await markdownTextSplitter.splitText(markdownText);

    return markdownChunks;
}


async function ingestPdf(filePath: string): Promise<string[]> {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();

    const chunks = docs.reduce((acc: string[], curr) => {
        const temp = chunkText(curr.pageContent, {
            chunkOverlap: chunkOverlap,
            chunkSize: chunkSize,
            method: 'paragraph'
        })

        return [...acc, ...temp]
    }, [] as string[])

    return chunks
}

