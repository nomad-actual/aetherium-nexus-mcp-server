# aetherium-nexus

MCP server built on Node.js that exposes a set of tools to AI clients via Streamable HTTP transport.

## Features

- **6 MCP tools** — weather, time, web search, package tracking, web scraping
- **Scraping chain** — CRW (Firecrawl-compatible) scraper as primary, local readability-based HTML scraping as fallback
- **Streamable HTTP transport** — stateless JSON-RPC 2.0 on `POST /mcp`
- **Native TypeScript** — runs `.ts` files directly via `node --experimental-strip-types` (no build step)
- **Docker support** — Alpine-based production image with GitHub Container Registry publishing
- **Configurable** — all settings via environment variables (locale, units, timeouts)

## Architecture

```
src/
├── app.ts                      # Express entry point, mounts MCP transport on POST /mcp
├── types.ts                    # Shared TypeScript types
├── server/
│   └── mcp.server.ts           # Builds MCP server and registers all tools
├── tools/                      # One file per MCP tool
│   ├── weather.ts              # Current weather + 7-day forecast
│   ├── time.ts                 # NTP-synced time
│   ├── websearch.ts            # Web search via SearXNG
│   ├── trackpackage.ts         # Package delivery tracking
│   └── website-scraper.ts      # Web page content scraping
└── utils/
    ├── config.ts               # Environment variable parsing → config singleton
    ├── logger.ts               # Pino-based logging
    ├── formatter.ts            # Locale-aware date/number formatting
    ├── location.ts             # City lookup helpers
    ├── location-db/            # Bundled location database
    ├── promises.ts             # Promise utility helpers
    └── webscraper/             # Web scraping orchestrator
        ├── webscraper.ts       # Orchestrator (routes to the right scraper)
        ├── CrwScraper.ts       # CRW (Firecrawl-compatible) API client, primary scraper
        ├── BasicHtmlScraper.ts # Local readability-based fallback scraper
        ├── IScraper.ts         # Scraper interface
        ├── normalizeWhitespace.ts # Whitespace normalization for scraped markdown
        └── test/               # Unit tests
```

### Key design decisions

- **Native TypeScript execution** — no compilation step, run `.ts` directly with Node.js
- **Stateless MCP server** — a fresh `McpServer` + `StreamableHTTPServerTransport` is created per request
- **Tool timeouts** — each tool call gets an `AbortSignal` with configurable timeout (default 30s)
- **Config singleton** — `getConfig()` parses all env vars once and caches the result

## Available Tools

| Tool | Description |
|------|-------------|
| `fetch-current-weather` | Current weather conditions at a location |
| `fetch-weather-forecast` | 7-day weather forecast for a location |
| `fetch-current-time` | NTP-synced time |
| `web-search` | Web search via SearXNG with content scraping |
| `track-package` | Package tracking with courier info and tracking page content |
| `scrape-website` | Extract readable content from any URL (CRW primary, local HTML fallback) |

See `docs/api.md` for full API documentation with input parameters and example JSON-RPC payloads.

## Getting Started

### Prerequisites

- **Node.js 24+** (required for `--experimental-strip-types`)
- **.env file** (copy from `.env.example`)
- **SearXNG instance** (for web search, optional)
- **CRW instance** (Firecrawl-compatible scraper, optional — falls back to local HTML scraping when `SCRAPER_CRW_HOST` is unset)

### Installation

```bash
npm install
cp .env.example .env
```

### Running

**Development:**

```bash
npm run start:dev
```

**Production:**

```bash
npm start
```

The server starts on the port/host defined in `.env` (default `localhost:3000`).

### Docker

```bash
docker compose up --build
```

## Configuration

All configuration comes from environment variables. Copy `.env.example` to `.env` and adjust values.

| Group | Variables | Description |
|-------|-----------|-------------|
| **MCP Server** | `MCP_SERVER_PORT`, `MCP_SERVER_HOST`, `MCP_SERVER_TITLE`, `MCP_SERVER_VERSION`, `MCP_SERVER_CORS_*`, `TOOL_CALL_TIMEOUT` | Server listen address, CORS, title, reported version, tool call timeout |
| **Location** | `DEFAULT_LOCATION_LAT`, `DEFAULT_LOCATION_LON` | Default lat/lon for weather fallback |
| **NTP** | `TIMESERVER_HOST`, `TIMESERVER_PORT`, `TIMESERVER_TIMEOUT` | NTP time server settings |
| **Locale** | `LOCALE_REGION`, `LOCALE_UNITS`, `LOCALE_MONTH`, `LOCALE_SHOWWEEKDAY`, `IS_24_HOUR_TIME` | Date/time formatting and units |
| **Search** | `SEARCH_HOST`, `SEARCH_TIMEOUT`, `SEARCH_MAX_RESULTS`, `SEARCH_PAGE_CONTENT_LIMIT` | SearXNG instance settings |
| **Scraper** | `SCRAPER_CONTENT_LIMIT`, `SCRAPER_REQUEST_TIMEOUT`, `SCRAPER_CRW_HOST`, `SCRAPER_CRW_API_KEY`, `SCRAPER_CRW_RENDER_JS`, `SCRAPER_CRW_ONLY_MAIN_CONTENT`, `SCRAPER_BASIC_MIN_LENGTH` | Content limits, timeouts, CRW (Firecrawl-compatible) host/key/render options, min readable content length |

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `src/tools/` | MCP tool implementations |
| `src/server/` | MCP server construction |
| `src/utils/` | Shared utilities (config, logging, formatting, scraping) |
| `docs/` | Documentation (`api.md`, `AGENTS.md`) |

## Development

### Adding a new tool

1. Create `src/tools/<name>.ts` with a `build<Name>Tool()` function returning `ToolsDef`
2. Add `build<Name>Tool()` to the `toolsDef` array in `src/server/mcp.server.ts`
3. If the tool needs config, add env var parsing to `src/utils/config.ts` and extend `AetheriumConfig` in `src/types.ts`

### Type checking

```bash
npx tsc --noEmit
```

## Testing

Unit tests use [AVA](https://github.com/avajs/ava) and run natively via Node's type stripping — no build step.

```bash
npm test
```

## CI/CD

Two GitHub Actions workflows:

- **`.github/workflows/ci.yml`** — runs the unit tests (`npm test`) on PRs and pushes to `main`.
- **`.github/workflows/release.yml`** — creates the release and publishes the Docker image, triggered only when a PR is merged into `main`. The version bump comes from the branch name (`major/` → major, `fix/`/`hotfix/` → patch, anything else → minor). A `vX.Y.Z` tag and GitHub release are created, and the image is pushed to GHCR as `vX.Y.Z` and `latest`.

The release version is baked into the image (`MCP_SERVER_VERSION`) and reported by the server. See `docs/AGENTS.md` for details.

## License

ISC
