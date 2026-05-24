# Skill: create-tool

Create a new MCP tool with boilerplate code, registration, and documentation.

## When to trigger

- User says: "create a new tool", "add an MCP tool", "generate a tool", "make a tool for..."
- User describes functionality that should be an MCP tool

## How it works

### 1. Parse the tool request

From the user's description, extract:
- **toolName**: kebab-case name (e.g., `convert-units`, `stock-price`, `email-sender`)
- **title**: display title (e.g., "Convert Units")
- **description**: what the tool does
- **inputParameters**: object with parameter names, Zod types, and descriptions
- **attributes**: readOnlyHint, openWorldHint (default: both `true`)
- **handlerLogic**: any specific logic the user mentions

If any are missing, ask the user for clarification before proceeding.

### 2. Generate the tool file

Create `src/tools/<toolName>.ts` with this structure:

```ts
import z from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.d.ts'
import type { AetheriumConfig, ToolsDef } from '../types.ts'
import { getConfig } from '../utils/config.ts'
import logger from '../utils/logger.ts'

// placeholder: add any imports needed for this tool's logic

async function <handlerFunctionName>(
    args: { <parameterName>: <type>, ... },
    config: AetheriumConfig,
    signal: AbortSignal
): Promise<CallToolResult> {
    signal.throwIfAborted()
    
    // TODO: implement tool logic here
    
    return {
        content: [{ type: 'text', text: 'TODO: implement this tool' }],
    }
}

export function build< PascalCaseToolName >Tool(): ToolsDef {
    return {
        name: '<toolName>',
        config: {
            title: '<title>',
            description: '<description>',
            inputSchema: {
                <parameterName>: z.<type>()
                    .describe('<parameter description>')
                    // add .optional(), .default(), .trim(), .nonempty(), etc. as needed
            },
            annotations: {
                title: '<title>',
                readOnlyHint: <readOnlyHint>,
                openWorldHint: <openWorldHint>,
            }
        },
        handler: async (args: any, signal: AbortSignal) => {
            const config = getConfig()
            return <handlerFunctionName>(args, config, signal)
        }
    }
}
```

Handler naming convention:
- Tool `track-package` → handler `trackPackageHandler`
- Tool `fetch-current-time` → handler `fetchCurrentTimeHandler`
- Convert kebab-case to camelCase for the handler function name

### 3. Register the tool

Update `src/server/mcp.server.ts`:

1. Add the import: `import { build<ToolName>Tool } from '../tools/<toolName>.ts'`
2. Add to the `toolsDef` array: `build<ToolName>Tool(),`

Import order: alphabetically by tool name within the import statement.
Array order: append to the end of `toolsDef`.

### 4. Update docs/api.md

Append a new tool section to `docs/api.md` in the Tools section, before the "Disabled Tools" section:

```markdown
### `<toolName>`

**Description**: <description>.

**Method**: `POST /mcp`

**Input Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<param>` | `<type>` | <Yes/No> | <description> |

**Attributes**:
- **ReadOnlyHint**: `<true/false>`
- **OpenWorldHint**: `<true/false>`

**Example usage**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "<toolName>",
    "arguments": {
      <param>: "<example value>"
    }
  }
}
```

**Response**: Returns `CallToolResult` with content array.
```

For the "Example usage" arguments section:
- Only include required parameters with a placeholder example value
- Omit optional parameters
- Use the parameter type to suggest a sensible placeholder (string → `"<param value>"`, number → `0`, boolean → `true`, array → `["item"]`)

For the Type column:
- `z.string()` → `string`
- `z.number()` → `number`
- `z.boolean()` → `boolean`
- `z.array(z.string())` → `string[]`
- `z.optional(...)` → mark as "No" in Required column
- `z.coerce.boolean()` → `boolean`

### 5. Update openapi.json

Add to `openapi.json`:

1. Add the tool name to the `params.name.enum` array in the request body schema
2. Add a new `example` in the `examples` object for this tool
3. Add a new schema in `components.schemas` named `<ToolName>Input` with the input parameters

For the example:
```json
"<toolName>": {
  "value": {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "<toolName>",
      "arguments": {
        <required params with placeholder values>
      }
    }
  }
}
```

For the schema:
```json
"<ToolName>Input": {
  "type": "object",
  "properties": {
    <param>: { "type": "<json-schema-type>", "description": "<description>" }
  },
  <"required": ["<required params>"] if any>
}
```

Type mapping:
- `z.string()` → `"string"`
- `z.number()` → `"number"`
- `z.boolean()` → `"boolean"`
- `z.array(z.string())` → `"array"` with `items`

### 6. Verify

After all files are written:
1. Run `npx tsc --noEmit` to check for type errors
2. If errors exist, fix them (common issues: missing imports, incorrect types)
3. Report success to the user with the tool name and file locations

## Important rules

- **Ask for missing info** — if the user doesn't specify input parameters, ask for them
- **Use Zod for schemas** — all input parameters must use Zod types
- **Keep the handler as a TODO** — the handler should return a placeholder, not dummy data
- **Always register the tool** — don't leave it unregistered in `mcp.server.ts`
- **Update both docs files** — `docs/api.md` and `openapi.json` must both reflect the new tool
- **Follow naming conventions** — kebab-case for tool name, PascalCase for the `buildXxxTool()` export, camelCase for handler function
- **Respect existing patterns** — match the style of existing tool files (imports, structure, error handling)
- **Check for conflicts** — if a tool with the same name already exists, ask before overwriting

## Examples

### Example 1: Simple tool with no parameters

User: "Create a tool to generate a random number"

→ Creates `src/tools/random-number.ts` with empty inputSchema, registers it, updates docs.

### Example 2: Tool with parameters

User: "Add a tool that converts between temperature units, takes a value and a unit (celsius/fahrenheit)"

→ Creates `src/tools/convert-temp.ts`:
```ts
inputSchema: {
    value: z.number().describe("Temperature value to convert"),
    unit: z.enum(["celsius", "fahrenheit"]).describe("Current unit of the temperature")
}
```

### Example 3: Tool with optional params

User: "A stock price checker, requires a ticker symbol and optionally returns historical data"

→ Creates `src/tools/stock-price.ts`:
```ts
inputSchema: {
    ticker: z.string().describe("Stock ticker symbol").trim().nonempty(),
    historical: z.optional(z.boolean().describe("Include historical price data"))
}
```

Base directory for this skill: file:///home/dlr/projects/aetherium-nexus-mcp-server/.opencode/skills/create-tool
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.
