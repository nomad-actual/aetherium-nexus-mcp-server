# Aetherium Nexus MCP Server

## What is this repo?

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server built on Node.js that exposes a set of tools to AI clients via Streamable HTTP transport. It also includes a RAG (Retrieval-Augmented Generation) pipeline for embedding and searching local documents.

## Architecture

```
src/
├── app.ts              # Express entry point, mounts MCP transport on POST /mcp
├── types.ts            # Shared TypeScript types (config, weather, RAG, scraper, tools)
├── server/
│   └── mcp.server.ts   # Builds the MCP server instance and registers all tools
├── tools/              # Individual MCP tool implementations (one file per tool)
├── rag/                # RAG pipeline: ingest, embed (via Ollama), and search
│   ├── indexer.ts      # CLI entry point for building embeddings
│   ├── search.ts       # CLI entry point for querying embeddings
│   ├── reset.ts        # CLI entry point for clearing the datastore
│   ├── ingestor/       # File parsing (officeparser, text chunking)
│   └── database/       # Datastore backends (JSON file, OpenSearch)
└── utils/
    ├── config.ts       # Environment variable parsing → AetheriumConfig singleton
    ├── logger.ts       # Pino-based logging
    ├── formatter.ts    # Locale-aware date/number formatting
    ├── location.ts     # City lookup helpers
    ├── location-db/    # Bundled location database
    ├── promises.ts     # Promise utility helpers
    ├── text.chunker.ts # Text splitting for RAG
    └── webscraper/     # Web scraping (basic HTML, Reddit, orchestrator)
```

### Key design decisions

- **Native TypeScript execution**: The project uses `node --experimental-strip-types` to run `.ts` files directly — no build/compile step.
- **Stateless MCP server**: A fresh `McpServer` + `StreamableHTTPServerTransport` is created per POST `/mcp` request. GET and DELETE on `/mcp` return 405.
- **Tool timeout**: Each tool call gets an `AbortSignal` with a configurable timeout (`TOOL_CALL_TIMEOUT`, default 10s).
- **Config singleton**: `getConfig()` in `src/utils/config.ts` parses all env vars once and caches the result. All code imports from there.

## Available MCP Tools

| Tool | File | Description |
|------|------|-------------|
| `currentweather` | `src/tools/weather.ts` | Current conditions at a given location |
| `forecast` | `src/tools/weather.ts` | Multi-day weather forecast |
| `time` | `src/tools/time.ts` | NTP-synced time query |
| `websearch` | `src/tools/websearch.ts` | Web search via SearXNG |
| `trackpackage` | `src/tools/trackpackage.ts` | Package delivery tracking |
| `webscraper` | `src/tools/website-scraper.ts` | Scrape and summarize web pages (with Reddit support) |

## RAG Pipeline

The RAG subsystem indexes local files into embeddings stored in either a JSON file or OpenSearch, then supports similarity search.

```
Files → ingestor (parse + chunk) → Ollama embed → datastore (JSON / OpenSearch)
                                                                    ↓
Query → Ollama embed → cosine similarity search → ranked results
```

### RAG Datastore backends

- **JSON** (`RAG_DATASTORE=json`): Simple `embeddings.json` file, uses BM25 + cosine similarity
- **OpenSearch** (`RAG_DATASTORE=opensearch`): Full OpenSearch cluster with dense vector search

### RAG CLI commands

| Command | Script | Purpose |
|---------|--------|---------|
| `npm run rag:ingest` | `src/rag/indexer.ts` | Crawl configured directories, parse files, generate embeddings, save to datastore |
| `npm run rag:search` | `src/rag/search.ts` | Query the embedding datastore |
| `npm run rag:reset` | `src/rag/reset.ts` | Clear the datastore |

## How to run

### Prerequisites

- **Node.js 24+** (required for `--experimental-strip-types`)
- **.env file** (copy from `.env.example` and fill in values)
- **Ollama** running locally (for RAG embeddings/embedding model)
- **SearXNG instance** (for web search tool, set `SEARCH_HOST`)

### Development

```bash
npm install
cp .env.example .env
npm run start:dev
```

The server starts on the port/host defined in `.env` (default `localhost:3000`).

### Production / Docker

```bash
docker compose up --build
```

The Dockerfile uses `node:24-alpine3.23`, installs production deps only, and runs `npm start`.

### RAG indexing

```bash
npm run rag:ingest
```

## Configuration

All configuration comes from environment variables (see `.env.example` for full list). Key groups:

| Group | env prefix | Controls |
|-------|-----------|----------|
| MCP Server | `MCP_SERVER_*` | Port, host, CORS, title, tool timeout |
| Location | `DEFAULT_LOCATION_*` | Default lat/lon for weather/time tools |
| NTP | `TIMESERVER_*` | Time server host, port, timeout |
| Locale | `LOCALE_*` | Region, units, date format, 24h time |
| Search | `SEARCH_*` | SearXNG host, timeout, content limit, max results |
| Scraper | `SCRAPER_*` | Content limits, timeouts, Reddit scraping options |
| RAG | `RAG_*` | Datastore type, storage URI, directories, file extensions |
| LLM | `LLM_*`, `EMBEDDING_*`, `SEMANTIC_*` | Ollama host, embedding/search models |

## Adding a new tool

1. Create a new file in `src/tools/` (e.g., `src/tools/mytool.ts`)
2. Export a `buildMyTool()` function that returns a `ToolsDef` object:
   ```ts
   import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'
   import type { AetheriumConfig, ToolsDef } from '../types.ts'
   import { getConfig } from '../utils/config.ts'

   export function buildMyTool(): ToolsDef {
       return {
           name: 'mytool',
           config: {
               description: 'My tool description',
               inputSchema: {
                   // use Zod schemas here
               },
               annotations: {
                   title: 'My Tool',
                   readOnlyHint: true,
                   openWorldHint: false,
               },
           },
           handler: async (args: any, signal: AbortSignal) => {
               const config = getConfig()
               signal.throwIfAborted()
               // tool logic
               return { content: [{ type: 'text', text: 'result' }] };
           },
       };
   }
   ```
3. Register it in `src/server/mcp.server.ts` by adding `buildMyTool()` to the `toolsDef` array
4. If the tool needs config, add env var parsing to `src/utils/config.ts` and extend `AetheriumConfig` in `src/types.ts`

### Common pitfalls

- **`CallToolResult` is NOT exported from `src/types.ts`** — it's only imported locally there for the `ToolsDef` type. Always import `CallToolResult` directly from `@modelcontextprotocol/sdk/types.d.ts`. This is a recurring gotcha that causes `TS2459` errors.
- **`getConfig()` returns a cached singleton** — the config object is memoized on first call (`src/utils/config.ts:25`). Never mutate the returned object. If you need a modified copy (e.g., overriding `limitResults`), spread it into a new object first.
- **Always check `signal.throwIfAborted()`** early in your handler. The MCP server wraps each tool call with `AbortSignal.timeout(config.mcpServer.toolCallRequestTimeout)` (default 10s). Long-running work should also pass the signal along to downstream calls when possible.
- **No build step** — the project runs `.ts` files natively via `node --experimental-strip-types`. TypeScript is checked with `npx tsc --noEmit`, not compiled.

## Testing

No test framework is currently configured. The `test` script in `package.json` is a placeholder.

## CI/CD

GitHub Actions workflows are in `.github/workflows/`.
