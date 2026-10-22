# Visualise Page

Turn a readable webpage into a clear, editable Excalidraw diagram. Visualise
Page extracts article content, lets you review it before sharing, and builds a
flowchart, mind map, concept map, or infographic that stays editable in your
browser.

## Current features

- Extract article text from the active tab, or paste text when a page blocks
  extraction.
- Choose a diagram style and level of detail, then preview the source content
  before sending it to an AI provider.
- Generate diagrams with OpenAI or use the local heuristic preview.
- Refine diagrams with natural-language instructions, edit their shapes, and
  save versions and recovery checkpoints locally.
- Export `.excalidraw`, SVG, or PNG files.

## Under development

[Vol 06 — Additional Connections](paper-trail/vols/06-additional-connections.md)
is still in progress. This work adds Anthropic, localhost-only Ollama, approved
custom OpenAI-compatible endpoints, named profiles, and an optional remote MCP
connection manager. MCP initialization and tool-schema discovery are
experimental; hosted Excalidraw MCP Apps rendering is not implemented or
claimed. A protocol test does not establish interactive-view compatibility, and
the local Excalidraw document remains the canonical output and fallback.

## Install locally in Chrome

Requirements: Node.js with npm and Google Chrome.

```sh
git clone https://github.com/Devine-Davies/web-skecher.git
cd web-skecher
npm ci
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Select **Load unpacked** and choose the generated `dist/` directory.
3. Open the extension’s side panel. You can also use its toolbar button.

The production build writes the unpacked extension to `dist/` and includes its
Manifest V3 `manifest.json`.

## First run and usage

1. In onboarding or **Settings**, choose a provider and configure its model.
   Enter your own provider API key when needed. Ollama must be running locally;
   custom endpoints require explicit approval of the endpoint.
2. Use **Test AI Connection** to check connectivity. Chrome may ask for access
   to that provider’s host.
3. Open a supported webpage, review the extracted text with **Content Preview**,
   choose a diagram style, and select **Visualise Page**.
4. With the default sharing-approval setting enabled, review the confirmation
   and approve before page text is sent to the selected AI provider. Open the
   generated diagram to edit, refine, or export it.

## Privacy and permissions

Diagrams and extracted documents are stored in the browser. By default, page
text is sent to the selected AI provider only after the content-sharing
confirmation. You can disable **Require content preview approval** in Settings;
when disabled, generation sends page text without that additional confirmation.
An optional MCP connection test sends protocol messages to its approved
endpoint, but does not send webpage content or invoke a tool. Remote MCP tool
calls are not part of diagram generation.

Provider and MCP credentials are stored separately from general settings.
Credentials use session storage unless you opt into keeping them in local
extension storage; local extension storage is not a hardware-backed vault.
Credentials are not synced across browsers by Visualise Page.

The extension uses `activeTab` to read the current page after you invoke it.
Network host access is optional and requested for the specific provider or MCP
host you test. Chrome still controls the permission prompt. Custom AI endpoints
must be public HTTPS URLs; MCP connections also require public HTTPS, and local
or private-network MCP endpoints are blocked. Ollama is limited to localhost.

## Troubleshooting and limits

- **No text extracted:** Browser-internal pages and Chrome Web Store pages
  cannot be read by extensions. Direct PDF, archive, image, audio, and video
  files are not supported by the HTML extractor. Use **Paste Text** instead.
- **Provider connection fails:** Check the model, key, endpoint, and Chrome
  host-access prompt. Cross-origin requests also depend on the remote server’s
  CORS policy.
- **Ollama is unreachable:** Start Ollama, confirm the local URL and model, and
  configure `OLLAMA_ORIGINS` to permit the Chrome extension origin. Browser
  CORS or local-server settings can prevent a connection even when Ollama is
  running.
- **MCP does not open an Excalidraw canvas:** The extension is not an MCP Apps
  host. MCP support is experimental, and a successful protocol handshake does
  not establish interactive-view compatibility. Create and edit diagrams using
  the local Excalidraw renderer.
- **A page is restricted:** Use the extension on an ordinary webpage, or paste
  the relevant content manually.

## Development

Install dependencies with `npm ci`, then use the scripts defined in
[`package.json`](package.json):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create the production extension in `dist/` |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm test` | Run the Vitest suite once |

### Project structure

- `src/content/` — webpage extraction.
- `src/sidepanel/` — onboarding, settings, page review, and generation controls.
- `src/core/ai/` — provider adapters, prompts, and generation/refinement flows.
- `src/core/mcp/` — remote MCP transport and connection diagnostics.
- `src/core/diagrams/` — diagram validation, layout, Excalidraw rendering, and
  local SVG generation.
- `src/core/storage/` — browser settings, IndexedDB persistence, and recovery.
- `src/editor/` — editable Excalidraw canvas, refinement, history, and export.
- `public/manifest.json` — extension permissions and entry-point configuration.

## Contributing and roadmap

See the [paper-trail status index](paper-trail/README.md) for planned and
completed work. Vols [01](paper-trail/vols/01-extension-foundation.md),
[02](paper-trail/vols/02-content-extraction.md),
[03](paper-trail/vols/03-ai-generation.md),
[04](paper-trail/vols/04-excalidraw-rendering.md),
[05](paper-trail/vols/05-refinement-and-persistence.md),
[06](paper-trail/vols/06-additional-connections.md), and
[07](paper-trail/vols/07-production-readiness.md) describe the roadmap.

Before proposing changes, run `npm run typecheck`, `npm test`, and
`npm run build`. Keep the root README focused on the product; the separate
paper-trail README is the project status index.
