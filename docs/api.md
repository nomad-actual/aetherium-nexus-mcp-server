# API Documentation

## Overview

**aetherium-nexus** exposes 6 MCP tools via Streamable HTTP transport on `POST /mcp`.

| Detail | Value |
|--------|-------|
| Server | aetherium-nexus v1.0.0 |
| Transport | Streamable HTTP (JSON-RPC 2.0) |
| Endpoints | `POST /mcp` (MCP), `GET /health` (health check) |
| Protocol | MCP SDK |

## Transport

All tool calls are made via a single HTTP endpoint. The server is stateless — each request creates a new server instance, so no session management is required.

**Base URL**: `http://<host>:<port>` (default: `http://localhost:3000`)

**CORS**: The server has CORS configuration available (`corsAllowedHosts`) but is currently commented out in the default setup.

### Request Format

Send a JSON-RPC 2.0 message to `POST /mcp`. The `id` may be a string or integer (notifications omit it). Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call` (all 6 tools are invoked through `tools/call`). A single message or a JSON-RPC batch (array of messages) is accepted.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "<tool-name>",
    "arguments": { ... }
  }
}
```

**Required headers** (enforced by the Streamable HTTP transport):

| Header | Value | If missing/invalid |
|--------|-------|--------------------|
| `Content-Type` | `application/json` | 415 |
| `Accept` | must list both `application/json` and `text/event-stream` | 406 |

### Response Format

Responses are returned as `application/json` (or streamed as `text/event-stream`, where each `message` event's `data` field is one JSON-RPC response). The shape of `result` depends on the method:

- `tools/call` → `CallToolResult` with a `content` array. Each content item has a `type` (`text` or `image`):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "..." },
      { "type": "image", "data": "...", "mimeType": "image/png" }
    ]
  }
}
```

- `tools/list` → `{ "tools": [ { name, title, description, inputSchema, annotations }, ... ] }`
- `initialize` → `{ "protocolVersion", "capabilities", "serverInfo": { name, version, title } }`
- `ping` → `{}`

Notifications (e.g. `notifications/initialized`) return **202 Accepted** with an empty body.

### Tool Errors vs Protocol Errors

- **Tool execution failures** (e.g. "Location not found", a scrape failure) are NOT HTTP errors. They return **200** with `result.isError: true` and the error message in `content`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "Location not found" }],
    "isError": true
  }
}
```

- **Input validation failures** (arguments that don't match the tool's schema) are also returned as tool errors — `result.isError: true` with a message like `MCP error -32602: Input validation error: Invalid arguments for tool web-search: ...`.
- **Protocol errors** (unknown method `-32601`, malformed message `-32700`, etc.) return a JSON-RPC error body at HTTP 200:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found"
  },
  "id": 1
}
```

- **Transport-level failures** (bad headers, parse errors, uncaught exceptions) return a JSON-RPC error body with the corresponding HTTP status:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Internal server error"
  },
  "id": null
}
```

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| `200` | JSON-RPC response (success `result` or protocol `error`) |
| `202` | Notification accepted (empty body) |
| `400` | Invalid JSON (HTML error page) / invalid JSON-RPC message / unsupported protocol version (JSON-RPC error body) |
| `405` | Method not allowed on `/mcp` (GET, DELETE) |
| `406` | `Accept` header missing `application/json` or `text/event-stream` |
| `415` | `Content-Type` is not `application/json` |
| `500` | Uncaught internal server error |

### HTTP Methods

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/mcp` | Handle MCP requests (JSON-RPC 2.0) |
| `GET` | `/mcp` | Not allowed — returns 405 |
| `DELETE` | `/mcp` | Not allowed — returns 405 |
| `GET` | `/health` | Health check — returns `{ "status": "ok", "uptime": <seconds> }` |

---

## Tools

### `fetch-current-weather`

**Description**: Gets the current weather for a given location. If no location is provided, uses the configured default location.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `location` | `string` | No | Location to search for current weather |

**Attributes**:
- **ReadOnlyHint**: `true`
- **OpenWorldHint**: `true`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "fetch-current-weather",
    "arguments": {
      "location": "New York"
    }
  }
}
```

**Response**: Returns `CallToolResult` with current temperature, weather description, high/low temps, precipitation, and location string.

---

### `fetch-weather-forecast`

**Description**: Gets the weather forecast (current conditions + 7-day forecast) for a given location.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `location` | `string` | No | Location to search for weather forecast |

**Attributes**:
- **ReadOnlyHint**: `true`
- **OpenWorldHint**: `true`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "fetch-weather-forecast",
    "arguments": {
      "location": "London"
    }
  }
}
```

**Response**: Returns `CallToolResult` with current conditions, location string, day of week, and 7-day forecast data including daily temperature ranges, precipitation, and weather descriptions.

---

### `fetch-current-time`

**Description**: Gets the current time from an NTP server.

**Method**: `POST /mcp`

**Input Parameters**: This tool takes no input parameters.

**Attributes**:
- **ReadOnlyHint**: `true`
- **OpenWorldHint**: `true`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "fetch-current-time",
    "arguments": {}
  }
}
```

**Response**: Returns `CallToolResult` with formatted date and time string.

---

### `web-search`

**Description**: Searches the web via SearXNG and scrapes the top result pages for readable content.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | The query to search against (must be non-empty) |

**Attributes**:
- **ReadOnlyHint**: `true`
- **OpenWorldHint**: `true`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "web-search",
    "arguments": {
      "query": "latest AI news"
    }
  }
}
```

**Response**: Returns `CallToolResult` with a summary of search duration and scraped content from the top result pages.

---

### `track-package`

**Description**: Tracks the status of one or more packages using tracking numbers. Returns courier info and scraped text content from carrier tracking pages.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `packages` | `string[]` | Yes | Array of tracking numbers (minimum 1; the server tracks up to 20 per call — more returns a text notice, not a validation error) |

**Attributes**:
- **ReadOnlyHint**: `true`
- **OpenWorldHint**: `true`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "track-package",
    "arguments": {
      "packages": ["1Z999AA10123456784", "9400111899205550000000"]
    }
  }
}
```

**Response**: Returns `CallToolResult` with a courier info summary (tracking number, courier name/code) and the scraped tracking page content for each package. Packages whose tracking URL yields no content are logged and skipped.

---

### `scrape-website`

**Description**: Scrapes a website and returns the primary readable content using Readability parser.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `string` | Yes | The URL to scrape (must be a valid URL, non-empty) |

**Attributes**:
- **ReadOnlyHint**: `true`
- **OpenWorldHint**: `true`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "scrape-website",
    "arguments": {
      "url": "https://example.com/article"
    }
  }
}
```

**Response**: Returns `CallToolResult` with the extracted readable content from the page.

---

## Configuration

The server behavior is controlled by the `AetheriumConfig` loaded from environment variables:

| Config Key | Description |
|-----------|-------------|
| `mcpServer.port` | Server listening port |
| `mcpServer.host` | Server listening host |
| `mcpServer.title` | MCP server display title |
| `mcpServer.toolCallRequestTimeout` | Timeout for tool calls |
| `mcpServer.corsAllowedHosts` | CORS allowed hosts |
| `defaultLocation.lat` | Default latitude |
| `defaultLocation.lon` | Default longitude |
| `defaultLocation.timezone` | Default timezone |
| `locale.units` | Temperature/wind units (`metric` or imperial) |
| `search.host` | SearXNG search engine URL |
| `search.timeout` | Search request timeout |
| `search.maxResults` | Max search results to scrape |
| `search.contentLimit` | Max content length per page |
| `timeserver.host` | NTP server host |
| `timeserver.port` | NTP server port (default: 123) |
| `timeserver.timeout` | NTP request timeout |
