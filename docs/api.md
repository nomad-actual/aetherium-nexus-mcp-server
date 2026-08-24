# API Documentation

## Overview

**aetherium-nexus** exposes 6 MCP tools via Streamable HTTP transport on `POST /mcp`.

| Detail | Value |
|--------|-------|
| Server | aetherium-nexus v1.0.0 |
| Transport | Streamable HTTP (JSON-RPC 2.0) |
| Endpoint | `POST /mcp` |
| Protocol | MCP SDK |

## Transport

All tool calls are made via a single HTTP endpoint. The server is stateless — each request creates a new server instance.

**Base URL**: `http://<host>:<port>` (default: `http://localhost:3000`)

**CORS**: The server has CORS configuration available (`corsAllowedHosts`) but is currently commented out in the default setup.

### Request Format

Send a JSON-RPC 2.0 `tools/call` request to `POST /mcp`:

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

### Response Format

The server returns a `CallToolResult` with a `content` array. Each content item has a `type` (`text` or `image`):

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

### Error Response

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

### HTTP Methods

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/mcp` | Handle MCP tool calls (JSON-RPC) |
| `GET` | `/mcp` | Not allowed — returns 405 |
| `DELETE` | `/mcp` | Not allowed — returns 405 |

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

**Description**: Tracks the status of one or more packages using tracking numbers. Returns text info and screenshots from carrier tracking pages.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `packages` | `string[]` | Yes | Array of tracking numbers (minimum 1, maximum 20) |

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

**Response**: Returns `CallToolResult` with text summaries and PNG screenshots of carrier tracking pages for each package.

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
