---
status: planned        # planned | in-progress | blocked | done
milestone: m1
started:
completed:
---

# 06 — Additional Connections

## Goal
Expand AI provider support to Anthropic, Ollama, and custom OpenAI-compatible endpoints with saved provider profiles, and implement the configurable remote MCP connection manager with Excalidraw MCP integration and automatic fallback to the local renderer.

## Scope
- [ ] Anthropic provider adapter
- [ ] Ollama local provider adapter (with browser CORS and local connectivity handling)
- [ ] Custom OpenAI-compatible provider adapter with explicit endpoint approval
- [ ] Multiple saved provider profiles
- [ ] MCP connection manager (`MCPConnection` model, `streamable-http` transport, separate secret storage)
- [ ] MCP connection wizard, health testing, and runtime tool discovery (`read_me`, `create_view`, schema inspection)
- [ ] Optional preset and proof-of-concept integration for `https://mcp.excalidraw.com`
- [ ] Per-tool permissions, user approval gates, and seamless fallback to the local Excalidraw renderer

## Out of scope
- Running arbitrary local Node.js MCP servers inside the Chrome extension without a Native Messaging companion
- Sending webpage content to unknown MCP tools without explicit user confirmation
- Requiring a live Excalidraw MCP connection for core MVP diagram generation

## Notes
- **Acceptance criteria:** Multiple provider types work, and failed MCP connections do not prevent local diagram generation.
- Extends [03 — AI Generation](./03-ai-generation.md) and [04 — Excalidraw Rendering](./04-excalidraw-rendering.md).

---

## 1. Additional AI providers and profiles (P1)

### 1.1 Anthropic

P1.

Settings:

- API key
- Model
- Generation preferences

### 1.2 Ollama

P1.

Settings:

- Local server URL
- Model selector
- Connection status

The adapter must account for browser CORS restrictions and support appropriate local connectivity checks.

### 1.3 Custom OpenAI-compatible provider

P1.

Settings:

- Base URL
- Model name
- API key if required
- Optional additional headers, excluding unsafe overrides

Custom endpoints must be explicitly approved.

### 1.4 Provider profiles

Users may store multiple provider profiles.

Example:

- OpenAI — everyday explanations
- Anthropic — detailed diagrams
- Ollama — local processing
- Custom Provider — organisation model

Only one provider is required to be active for a generation job, although multiple profiles may be saved.

---

## 2. MCP connection manager

### 2.1 Purpose

Allow users to connect to remote MCP servers through supported transport mechanisms.

MCP must be treated separately from AI provider configuration.

An AI provider generates or refines diagram instructions.

An MCP server exposes tools or resources that the extension may call.

### 2.2 Required connection model

```ts
interface MCPConnection {
  id: string;
  name: string;
  endpoint: string;

  transport: "streamable-http";

  enabled: boolean;
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "error";

  allowedTools: string[];

  authMode:
    | "none"
    | "bearer"
    | "oauth";
}
```

Authentication secrets must be stored separately from general connection metadata.

### 2.3 Default Excalidraw MCP configuration

The extension should include an optional preset for:

`https://mcp.excalidraw.com`

The connection wizard must test:

- Endpoint reachability
- Browser CORS compatibility
- MCP protocol initialisation
- Tool discovery
- Required authentication
- MCP App support
- Interactive-resource rendering compatibility

A successful HTTP request is not sufficient proof that the integration works.

### 2.4 MCP tool discovery

Do not hardcode assumptions about every server's available tools.

After connection:

1. Initialise MCP session.
2. Request tool list.
3. Read tool input schemas.
4. Display permitted tools.
5. Validate calls before invocation.
6. Process tool results.
7. Report errors and unavailable capabilities.

Unknown tools must not receive webpage content automatically.

### 2.5 Excalidraw MCP integration

The official server is an MCP App, not a generic diagram CRUD service.

For the hosted interactive experience, the implementation must follow the server's current documented tools and MCP Apps host requirements.

Initial research indicates a workflow centred on the server's `read_me` and `create_view` tools.

The team must verify the exact schemas in the checked-out repository version.

Do not invent endpoints such as `/create-diagram` or assume tool names such as `add_shape` are exposed by the hosted server.

#### Integration strategies

**Strategy A — Local renderer (MVP)**

Convert DiagramSpec directly to Excalidraw scene elements.

This is the default, reliable rendering path.

**Strategy B — Hosted Excalidraw MCP App (P1)**

Use the remote server and a compatible MCP App host or supported external view.

This path is enabled only after a successful integration test.

**Strategy C — User-defined MCP server (P1)**

Allow users to configure custom MCP endpoints with explicit permissions.

### 2.6 Connection security

For every MCP server:

- Show its endpoint
- Require user approval before first connection
- Allow per-tool permission configuration
- Display authentication requirements
- Limit sensitive data transfer
- Protect against SSRF-style access to unintended local or private endpoints where applicable
- Require confirmation before sending article text
- Provide disconnect and delete controls
