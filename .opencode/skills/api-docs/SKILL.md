---
name: api-docs
description: Generates API documentation from code. Triggers when user asks to generate, create, write, or fix API docs, OpenAPI spec, swagger, or tool documentation. Analyzes MCP tools, Express/FastAPI routes, Zod schemas, and controller definitions.
---

# api-docs

Generate comprehensive API documentation from source code. Works with MCP tools, REST APIs, and GraphQL endpoints.

## When to trigger

- User says: "generate API docs", "create OpenAPI spec", "write swagger", "document the API", "fix the API docs"
- Project has API code but no documentation
- User asks for an OpenAPI/Swagger spec

## How it works

### 1. Detect API framework & scan for endpoints

Check for these frameworks and scan accordingly:

| Framework | Files to scan | Pattern |
|-----------|--------------|---------|
| **MCP (this project)** | `src/tools/*.ts`, `src/server/mcp.server.ts` | `buildXxxTool()` functions returning `ToolsDef` |
| **Express** | `src/routes/*.ts`, `src/controllers/*.ts`, `app.ts` | `app.get/post/put/delete/patch('/path', ...)` |
| **FastAPI** | `app.py`, `api/v1/endpoint*.py` | `@app.get("/path")`, `@router.get("/path")` |
| **Spring Boot** | `src/main/java/**/*.java` | `@GetMapping`, `@PostMapping`, `@RestController` |
| **Go (Gin)** | `internal/handler/*.go` | `router.GET("/path", handler)` |
| **GraphQL** | `schema.graphql`, `resolvers.js` | `.graphql` files or `makeExecutableSchema` |

### 2. For MCP tools (MCP SDK pattern)

Extract from `ToolsDef` objects:

```ts
// From src/server/mcp.server.ts — find all buildXxxTool() calls
// From each tool file — parse:
- name: string          // tool name (e.g., 'fetch-current-weather')
- description: string   // tool description from config
- title: string         // display title from config
- inputSchema: ZodSchema // Zod schema for input parameters
- annotations: { title, readOnlyHint, openWorldHint } // tool metadata
- handler signature // parameter types and return type
```

For each parameter in the Zod schema, extract:
- **name**: parameter key
- **type**: Zod type (`z.string()`, `z.number()`, `z.boolean()`, `z.enum()`, `z.array()`, `z.object()`, etc.)
- **required**: whether the Zod schema is `.optional()` or `.nullable()`
- **description**: from `.describe("...")` calls
- **examples**: from `.example(...)` or `.default(...)` calls

Map Zod types to JSON Schema:

| Zod | JSON Schema |
|-----|-------------|
| `z.string()` | `{ "type": "string" }` |
| `z.number()` | `{ "type": "number" }` |
| `z.boolean()` | `{ "type": "boolean" }` |
| `z.enum([a,b])` | `{ "type": "string", "enum": ["a","b"] }` |
| `z.array(z.string())` | `{ "type": "array", "items": { "type": "string" } }` |
| `z.object({ ... })` | `{ "type": "object", "properties": { ... } }` |
| `z.optional(z.string())` | `{ "type": "string" }` (not in required) |
| `z.string().nullable()` | `{ "type": ["string", "null"] }` |

### 3. For Express routes

Extract from route definitions:
- **method**: GET, POST, PUT, DELETE, PATCH
- **path**: URL pattern (e.g., `/api/users/:id`)
- **parameters**: path params (`:id`), query params (from `req.query` usage), body schema (from Zod/JSON schemas in handlers)
- **responses**: status codes and response types from handler return

### 4. Generate documentation

Create **both** outputs:

#### A. `docs/api.md` — Human-readable markdown

```markdown
# API Documentation

## Overview

<project-name> exposes <N> MCP tools via Streamable HTTP transport on `POST /mcp`.

## Authentication

<Note auth requirements if any, or "No authentication required">

## Tools

### `tool-name`

**Description**: What this tool does.

**Method**: `POST /mcp` (MCP tool call)

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param1` | `string` | No | Description from zod |

**Example usage**:

```json
{
  "method": "tools/call",
  "params": {
    "name": "tool-name",
    "arguments": {
      "param1": "value"
    }
  }
}
```

**Response**: Returns `CallToolResult` with content array.
```

#### B. `openapi.json` — OpenAPI 3.0 spec (for MCP tools)

Since MCP isn't a standard REST API, generate an OpenAPI spec that describes the MCP transport layer:

```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "<project-name>",
    "version": "<from package.json>",
    "description": "<from package.json description>"
  },
  "servers": [{ "url": "http://<host>:<port>" }],
  "paths": {
    "/mcp": {
      "post": {
        "summary": "MCP Tool Call",
        "description": "Call an MCP tool via Streamable HTTP transport.",
        "requestBody": { ... },
        "responses": { ... }
      }
    }
  },
  "components": {
    "schemas": {
      "<ToolName>Input": { ... },
      "<ToolName>Response": { ... }
    }
  }
}
```

### 5. Write outputs

- **`docs/api.md`** — Always write/update this (create `docs/` dir if needed)
- **`openapi.json`** — Write at project root if it doesn't exist, update if it does
- **Do NOT modify any source code files**

## Important rules

- **Be accurate** — only document tools/routes that actually exist in the codebase
- **Zod is the source of truth** for parameter types and descriptions in MCP tools
- **Extract descriptions from `.describe()` calls** in Zod schemas, not from variable names
- **If a tool has no input parameters**, note that explicitly: "This tool takes no input parameters"
- **Include the transport protocol** in docs (e.g., "MCP tools are called via `POST /mcp` with JSON-RPC payload")
- **If the project uses multiple frameworks** (e.g., Express for MCP + additional REST routes), document all of them
- **Don't invent example values** — use defaults from Zod `.default(...)` or skip examples entirely
- **If OpenAPI spec already exists**, generate a diff and ask whether to overwrite
- **Include handler return types** — from `CallToolResult` type or actual return statements

## Example triggers

User: "generate API docs for this project"
User: "write an OpenAPI spec"
User: "document the MCP tools"
User: "fix our swagger docs"
User: "what API endpoints exist?"
