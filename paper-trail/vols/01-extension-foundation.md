---
status: done        # planned | in-progress | blocked | done
milestone: m1
started: 2026-10-21
completed: 2026-10-21
---

# 01 — Extension Foundation

## Goal
Establish the Chrome Manifest V3 extension foundation for **Visualise Page**, including the toolbar action, side-panel UI shell, full-page editor route, initial onboarding and settings views, modular project structure, and build/local installation workflow.

## Scope
- [x] Working Chrome Manifest V3 extension configuration
- [x] Toolbar action and context-menu entry points
- [x] Side-panel interface layout and staged progress display
- [x] Full-page editor route in a dedicated Chrome tab
- [x] Initial onboarding flow and settings views
- [x] Modular project directory structure (`background`, `content`, `sidepanel`, `editor`, `core`, `shared`, `tests`)
- [x] Build and local installation workflow (TypeScript, React, Vite, CRXJS)

## Out of scope
- Running arbitrary Node.js programs inside Chrome
- Installing local MCP servers automatically
- Crawling entire websites
- Automatic diagram generation on every page
- Autonomous browsing without user approval
- Cloud accounts and subscriptions
- Real-time multi-user collaboration
- Full MCP Apps hosting without completing a compatibility proof of concept

## Notes
- **Acceptance criteria:** Extension loads without errors and opens the correct UI.
- **Metadata:** Version 1.0 | Platform: Google Chrome, Manifest V3 | Product category: AI-powered webpage visualisation | Primary diagram engine: Excalidraw | Primary workflow: Webpage → AI → Diagram → Editable canvas.
- Related volumes: [02 — Content Extraction](./02-content-extraction.md), [03 — AI Generation](./03-ai-generation.md), [04 — Excalidraw Rendering](./04-excalidraw-rendering.md), [05 — Refinement and Persistence](./05-refinement-and-persistence.md), [06 — Additional Connections](./06-additional-connections.md), [07 — Production Readiness](./07-production-readiness.md).

---

## 1. Product overview

Visualise Page is a Chrome extension that allows users to convert webpages into clear, editable diagrams using artificial intelligence.

The extension is intended to help users understand information that is difficult to follow in written form, including technical articles, tutorials, documentation, research explanations and complex workflows.

Users can choose their preferred AI provider and configure connections to MCP servers, including Excalidraw MCP.

The extension must work without requiring users to install Node.js or a desktop application for its core functionality.

### 1.1 Primary objective

Enable a user to open an article, click **Visualise Page**, and receive an editable diagram that accurately explains the article's most important ideas.

### 1.2 Core principles

1. **One-click simplicity:** The default workflow must require minimal user interaction.
2. **Provider flexibility:** Users must be able to switch AI providers.
3. **MCP extensibility:** MCP servers must be configurable rather than hardcoded.
4. **Editable output:** Generated diagrams must remain editable in Excalidraw.
5. **Source transparency:** Users must be able to trace diagram concepts to source content.
6. **Local-first:** Diagrams and preferences are saved locally unless the user explicitly enables cloud functionality.
7. **Privacy by design:** Users control which page content is sent to external services.
8. **Graceful fallback:** The extension must generate usable diagrams even when an external MCP service is unavailable.

### 1.3 Target users

- Developers reading technical documentation
- Students learning complex subjects
- Researchers analysing articles
- Product managers understanding systems
- Designers exploring workflows
- General readers who prefer visual explanations

### 1.4 Example user story

A developer is reading:

https://www.smashingmagazine.com/2026/08/how-baseline-can-help-ship-less-javascript/

They don't fully understand how Baseline can help reduce JavaScript dependencies.

They open the extension and select:

- Diagram type: Flowchart
- Detail: Simple
- AI provider: OpenAI
- Output: Excalidraw

They click **Generate Diagram**.

The extension extracts the article, asks OpenAI to identify the major ideas, and renders a flowchart explaining the relationship between browser compatibility, native browser APIs and unnecessary JavaScript dependencies.

The developer can then ask:

"Add an example showing when we can remove a JavaScript library."

The existing diagram updates without unnecessarily deleting unrelated elements.

---

## 2. Scope and feature priorities

### 2.1 MVP — Required (P0)

The first production milestone must include:

- Chrome Manifest V3 extension
- Chrome side-panel interface
- Extraction of the active webpage's main readable content
- Title, URL, headings and paragraph extraction
- Explicit preview and confirmation before sharing page content
- OpenAI integration
- Bring-your-own-API-key configuration
- Simple, balanced and detailed generation presets
- Flowchart, mind map and concept map options
- Structured JSON diagram generation
- Schema validation and controlled retries
- Local Excalidraw rendering
- Editable Excalidraw canvas in a full browser tab
- Local diagram persistence
- Reopen, rename and delete saved diagrams
- Regenerate diagram from source
- Plain-language follow-up instructions
- Export to `.excalidraw`, SVG and PNG
- Basic error handling
- Light and dark themes
- Basic accessibility and keyboard navigation

### 2.2 Second milestone — Required for broader provider support (P1)

- Anthropic integration
- Ollama integration
- Custom OpenAI-compatible endpoint
- Configurable remote MCP connections
- Official Excalidraw MCP integration, subject to compatibility tests
- Connection testing and health indicators
- Multiple saved AI profiles
- Per-provider model selection
- Diagram version history
- Source-to-diagram linking
- AI explanation of selected shapes
- Reusable generation presets

### 2.3 Advanced features (P2)

- Gemini integration
- External AI agent connections
- Native Messaging companion
- Multiple enabled MCP servers
- PDF extraction
- YouTube transcript visualisation
- GitHub repository overview diagrams
- Multi-page synthesis
- Collaboration and cloud sync
- Additional diagram styles
- Multi-agent workflows
- Agent-specific permissions
- Sharing links
- Local model discovery

### 2.4 Explicitly outside MVP

- Running arbitrary Node.js programs inside Chrome
- Installing local MCP servers automatically
- Crawling entire websites
- Automatic diagram generation on every page
- Autonomous browsing without user approval
- Cloud accounts and subscriptions
- Real-time multi-user collaboration
- Full MCP Apps hosting without completing a compatibility proof of concept

---

## 3. User experience — Foundation & Side Panel

### 3.1 Entry points

The extension must support these entry points:

**Toolbar action**

Clicking the extension icon opens the side panel.

**Context menu**

A context-menu entry called "Visualise this page" launches the page extraction workflow.

A separate context menu option, "Visualise selected text", is a P1 feature.

**Full editor**

A button in the side panel opens the Excalidraw editor in a dedicated Chrome tab.

### 3.2 Initial onboarding

On first launch:

1. Display a welcome screen.
2. Explain what the extension does.
3. Ask the user to select an AI provider.
4. Provide API-key or endpoint configuration.
5. Test the provider configuration.
6. Explain data-sharing behaviour.
7. Select default diagram preferences.
8. Finish onboarding.

The user must be able to revisit the onboarding configuration through Settings.

### 3.3 Main side-panel layout

Recommended width: approximately 360–420 CSS pixels, accommodating narrower layouts.

#### Header

- Application logo
- Product name
- Settings button
- Connection status

#### Current page section

- Website favicon
- Page title
- Website domain
- Extracted content status
- Content preview
- Optional selected-text source

#### Generation options

- AI provider selector
- AI model selector
- Diagram type
- Complexity level
- Additional instructions
- Output destination

#### Primary action

**Visualise Page**

#### Progress display

Use a staged progress indicator:

1. Reading webpage
2. Identifying concepts
3. Designing diagram
4. Creating Excalidraw elements
5. Opening result

Progress indicators should represent actual completed steps, not invented percentages.

#### Recent diagrams

Show the most recent saved diagrams, with options to reopen or delete.

---

## 4. System architecture

### 4.1 Main components

The extension should be divided into independently testable modules:

1. Chrome integration
2. Page extraction
3. Content processing
4. AI connection manager
5. AI generation engine
6. Diagram schema and validator
7. Diagram layout engine
8. Excalidraw renderer
9. MCP connection manager
10. Local storage
11. User interface
12. Security and permissions

### 4.2 Recommended technologies

| Layer | Technology |
|---|---|
| Extension platform | Chrome Manifest V3 |
| Application language | TypeScript |
| UI | React |
| Build tooling | Vite |
| Styling | Tailwind CSS or CSS Modules |
| Extension packaging | CRXJS or equivalent maintained tooling |
| Article extraction | Mozilla Readability |
| HTML parsing | Browser DOM APIs |
| AI structured outputs | Provider-specific JSON/schema mechanisms |
| Schema validation | Zod |
| Diagram editor | `@excalidraw/excalidraw` |
| Layout | Dagre or ELK.js |
| Large local storage | IndexedDB |
| Settings storage | `chrome.storage.local` |
| Temporary secrets | Session-scoped storage when appropriate |
| MCP | Maintained TypeScript MCP SDK, browser-compatible client transport |
| Testing | Vitest + Playwright |
| Static analysis | ESLint + TypeScript |

Specific dependency versions should be pinned after compatibility testing.

### 4.3 Execution contexts

**Content script**

Responsible only for reading the explicitly selected page and returning sanitised extraction data.

**Background service worker**

Responsible for Chrome events, tab orchestration, permissions and lightweight coordination.

**Side panel**

Responsible for user controls, generation configuration and connection management.

**Editor tab**

Responsible for diagram rendering, editing, exporting and persistent generation workflows.

Long-running AI or MCP sessions must not depend on the Manifest V3 service worker remaining continuously alive.

The editor or an appropriate extension document should own active streaming operations when required, with durable job checkpoints and reconnection handling.

### 4.4 Data flow

```text
Active Chrome Tab
        |
        v
Page Extraction
        |
        v
Normalised Article Content
        |
        v
User Review / Approval
        |
        v
Selected AI Provider
        |
        v
Structured Diagram Specification
        |
        v
Schema Validation
        |
        v
Layout and Scene Conversion
        |
        +-----------------------------+
        |                             |
        v                             v
Local Excalidraw Renderer       Remote MCP Adapter
        |                             |
        v                             v
Editable Local Canvas          MCP App / Remote View
        |                             |
        v
IndexedDB + Export
```

The locally rendered diagram is the canonical user-editable artifact in the MVP.

MCP output must never be the sole surviving copy of a diagram.

---

## 5. Suggested project structure

```text
visualise-page/
├── public/
│   ├── manifest.json
│   ├── icons/
│   └── assets/
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── messaging.ts
│   │   └── tabs.ts
│   ├── content/
│   │   ├── index.ts
│   │   └── extractor.ts
│   ├── sidepanel/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── pages/
│   ├── editor/
│   │   ├── App.tsx
│   │   ├── ExcalidrawEditor.tsx
│   │   └── components/
│   ├── core/
│   │   ├── ai/
│   │   │   ├── providers/
│   │   │   ├── types.ts
│   │   │   └── generation.ts
│   │   ├── extraction/
│   │   ├── diagrams/
│   │   │   ├── schema.ts
│   │   │   ├── layout.ts
│   │   │   ├── renderer.ts
│   │   │   └── patches.ts
│   │   ├── mcp/
│   │   │   ├── client.ts
│   │   │   ├── connections.ts
│   │   │   └── excalidraw.ts
│   │   ├── storage/
│   │   └── security/
│   ├── shared/
│   │   ├── types/
│   │   └── constants/
│   └── tests/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

The architecture should keep reusable application logic under `core/`, avoiding direct Chrome API dependencies wherever possible.

---

## 6. Final implementation directive

Build Visualise Page as a modular, local-first Chrome extension, not an Electron application.

Start with the simplest complete workflow:

**Webpage → OpenAI → validated diagram specification → Excalidraw → editable saved diagram.**

Build the AI provider adapters and MCP connection infrastructure as separate modules.

Do not couple the application to one provider, one MCP server or one transport.

Prioritise reliable article understanding, diagram clarity, editable output and privacy over advanced multi-agent functionality.

The final result must feel simple to the end user, even if the underlying connection architecture supports advanced workflows.
