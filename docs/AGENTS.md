# Aetherium Nexus MCP Server

## What is this repo?

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server built on Node.js that exposes a set of tools to AI clients via Streamable HTTP transport. It also includes a RAG (Retrieval-Augmented Generation) pipeline for embedding and searching local documents.

## Architecture

```
src/
├── app.ts                # Express entry point, mounts MCP transport on POST /mcp
├── types.ts              # Shared TypeScript types (config, weather, RAG, scraper, tools)
├── server/
│   └── mcp.server.ts     # Builds the MCP server instance and registers all tools
├── tools/                # MCP tool implementations (one file per tool)
│   ├── weather.ts        # fetch-current-weather, fetch-weather-forecast
│   ├── time.ts           # fetch-current-time
│   ├── websearch.ts      # web-search (via SearXNG)
│   ├── trackpackage.ts   # track-package
│   ├── website-scraper.ts# scrape-website (CRW primary, basic HTML fallback)
│   └── search.ts         # search — WIP, NOT registered (see "Available MCP Tools")
├── rag/                  # RAG pipeline: ingest, embed (via Ollama), and search
│   ├── indexer.ts        # CLI entry point for building embeddings
│   ├── search.ts         # CLI entry point for querying embeddings
│   ├── reset.ts          # CLI entry point for clearing the datastore
│   ├── ingestor/
│   │   └── ingestor.ts   # File parsing (officeparser) + text chunking
│   └── database/
│       ├── datastore.ts  # Shared datastore interface
│       ├── json.datastore.ts  # JSON file backend (BM25 + cosine similarity)
│       └── opensearch.ts      # OpenSearch backend (dense vector search)
└── utils/
    ├── config.ts         # Environment variable parsing → AetheriumConfig singleton
    ├── logger.ts         # Pino-based logging
    ├── formatter.ts      # Locale-aware date/number formatting
    ├── location.ts       # City lookup helpers
    ├── location-db/      # Bundled world-cities JSON database
    ├── promises.ts       # Promise utility helpers
    ├── text.chunker.ts   # Text splitting for RAG
    └── webscraper/
        ├── webscraper.ts # Orchestrator (routes to the right scraper)
        ├── BasicHtmlScraper.ts
        ├── CrwScraper.ts # Firecrawl-compatible CRW API client (primary web scraper)
        └── IScraper.ts   # Scraper interface
```

Repo root also contains `openapi.json` + `docs/api.md` (generated API docs) and `.npmrc`.

### Key design decisions

- **Native TypeScript execution**: The project uses `node --experimental-strip-types` to run `.ts` files directly — no build/compile step.
- **Stateless MCP server**: A fresh `McpServer` + `StreamableHTTPServerTransport` is created per POST `/mcp` request. GET and DELETE on `/mcp` return 405.
- **Tool timeout**: Each tool call gets an `AbortSignal` via `AbortSignal.timeout(config.mcpServer.toolCallRequestTimeout)` (`src/server/mcp.server.ts:42`), configurable through `TOOL_CALL_TIMEOUT` (default 10,000 ms).
- **Config singleton**: `getConfig()` in `src/utils/config.ts` parses all env vars once and caches the result. All code imports from there.
- **`.npmrc` sets `legacy-peer-deps=true`**: `@langchain/community` declares an unused `@browserbasehq/stagehand` peer that conflicts with `dotenv@17`; without this flag, `npm install` fails with ERESOLVE.

## Available MCP Tools

Registered in `src/server/mcp.server.ts`:

| Tool | File | Description |
|------|------|-------------|
| `fetch-current-weather` | `src/tools/weather.ts` | Current conditions at a given location |
| `fetch-weather-forecast` | `src/tools/weather.ts` | Multi-day weather forecast |
| `fetch-current-time` | `src/tools/time.ts` | NTP-synced time query |
| `web-search` | `src/tools/websearch.ts` | Web search via SearXNG |
| `track-package` | `src/tools/trackpackage.ts` | Package delivery tracking |
| `scrape-website` | `src/tools/website-scraper.ts` | Scrape web pages (primary CRW/Firecrawl-compatible scraper, basic HTML fallback) |

**Not registered (WIP):** `src/tools/search.ts` exports `buildSearchTool()` (tool name `search`), a combined RAG + web search tool. It is not in the `toolsDef` array; the commented-out import above it references a non-existent `../tools/rag-search.ts` — use `../tools/search.ts` if you register it.

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

Note: `npm run rag:temp` in `package.json` points to a non-existent `src/rag/temp.ts` and is broken.

## How to run

### Prerequisites

- **Node.js 24+** (required for `--experimental-strip-types`)
- **.env file** (copy from `.env.example` and fill in values)
- **Ollama** running locally (for RAG embeddings/search models)
- **SearXNG instance** (for the `web-search` tool, set `SEARCH_HOST`)

### Development

```bash
npm install
cp .env.example .env
npm run start:dev
```

- `start:dev` loads `.env` via `node --env-file=.env`; `npm start` does not (for containers where env comes from the runtime).
- The server listens on the port/host from `.env` (defaults: `localhost:3000`).

### Production / Docker

```bash
docker compose up --build
```

The Dockerfile uses `node:24-alpine3.23`, installs production deps only (`npm ci --omit=dev`), and runs `npm start`. `docker-compose.yml` mounts `.env` and maps port 3000.

### RAG indexing

```bash
npm run rag:ingest
```

## Configuration

**`src/utils/config.ts` is the source of truth** — it parses env vars with hardcoded defaults. `.env.example` mirrors it; if you add a new env var, update both.

| Group | env vars | Controls |
|-------|----------|----------|
| MCP Server | `MCP_SERVER_PORT`, `MCP_SERVER_HOST`, `MCP_SERVER_CORS_ALLOWED_ORIGINS`, `MCP_SERVER_CORS_ALLOWED_HOSTS`, `MCP_SERVER_TITLE`, `TOOL_CALL_TIMEOUT` | Port (3000), host (localhost), CORS lists (`\|`-separated), title, tool timeout ms (10000) |
| Location | `DEFAULT_LOCATION_LAT`, `DEFAULT_LOCATION_LON` | Default lat/lon (Los Angeles); timezone derived via `geo-tz` |
| NTP | `TIMESERVER_HOST`, `TIMESERVER_PORT`, `TIMESERVER_TIMEOUT` | Time server (time.nist.gov:123, 200 ms) |
| Locale | `LOCALE_REGION`, `LOCALE_UNITS`, `LOCALE_MONTH`, `LOCALE_SHOWWEEKDAY`, `IS_24_HOUR_TIME` | Region (en-US), units, month style, weekday, 24h time |
| Search | `SEARCH_HOST`, `SEARCH_TIMEOUT`, `SEARCH_PAGE_CONTENT_LIMIT`, `SEARCH_MAX_RESULTS` | SearXNG host, timeout ms, content limit, max results |
| Scraper | `SCRAPER_CONTENT_LIMIT`, `SCRAPER_REQUEST_TIMEOUT`, `SCRAPER_CRW_HOST`, `SCRAPER_CRW_API_KEY`, `SCRAPER_CRW_RENDER_JS`, `SCRAPER_CRW_ONLY_MAIN_CONTENT`, `SCRAPER_BASIC_MIN_SCORE`, `SCRAPER_BASIC_MIN_LENGTH` | Content limits, timeouts, CRW (Firecrawl-compatible) host/key/render options, readability thresholds |
| RAG | `RAG_DATASTORE`, `RAG_STORAGE_URI`, `RAG_LIMIT_RESULTS`, `RAG_SOURCE_DIRECTORIES`, `RAG_INCLUDE_FILE_EXT`, `RAG_MAX_FILE_SIZE_MB`, `RAG_IGNORE_DIRS` | Datastore type/URI, ingest dirs (`\|`-separated), file filters |
| LLM | `LLM_HOST`, `EMBEDDING_MODEL`, `EMBEDDING_MODEL_CONTEXT`, `SEMANTIC_SEARCH_ENABLED`, `SEMANTIC_SEARCH_MODEL`, `SEMANTIC_SEARCH_MODEL_CONTEXT` | Ollama host, embedding + semantic ranking models (Ollama model refs) |

## Verifying your work

There is no test framework (`npm test` is a placeholder). Verify changes like this:

```bash
# 1. Typecheck (the project's "build" step)
npx tsc --noEmit

# 2. Start the server
npm run start:dev

# 3. Smoke-test the MCP endpoint (new terminal)
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.0"}}}'
```

A healthy server responds with an SSE `message` event containing `serverInfo: { name: "Aetherium Nexus MCP Server", ... }`.

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
5. Regenerate API docs (`openapi.json`, `docs/api.md`) with the `api-docs` opencode skill

### Common pitfalls

- **`CallToolResult` is NOT exported from `src/types.ts`** — it's only imported locally there for the `ToolsDef` type. Always import `CallToolResult` directly from `@modelcontextprotocol/sdk/types.d.ts`. This is a recurring gotcha that causes `TS2459` errors.
- **`getConfig()` returns a cached singleton** — the config object is memoized on first call (`src/utils/config.ts:27`). Never mutate the returned object. If you need a modified copy (e.g., overriding `limitResults`), spread it into a new object first.
- **Always check `signal.throwIfAborted()`** early in your handler. The MCP server wraps each tool call with `AbortSignal.timeout(config.mcpServer.toolCallRequestTimeout)` (default 10s). Long-running work should also pass the signal along to downstream calls when possible.
- **No build step** — the project runs `.ts` files natively via `node --experimental-strip-types`. TypeScript is checked with `npx tsc --noEmit`, not compiled.
- **`npm install` must use `legacy-peer-deps`** — handled by the repo `.npmrc`; don't remove it (see "Key design decisions").

## Documentation

- **`openapi.json`** (root) and **`docs/api.md`** are generated from the tool definitions by the `api-docs` opencode skill (`.opencode/skills/api-docs/`). Regenerate them after adding/changing tools.
- This file (`docs/AGENTS.md`) is the primary source for the `readme-gen` opencode skill, which generates `README.md`.

## CI/CD

`.github/workflows/docker-publish.yml` builds the Docker image and:

- **push to `main` / `v*.*.*` tags / daily cron**: builds multi-platform image, pushes to GHCR, signs with cosign
- **pull requests**: build-only (no push, no signing)
