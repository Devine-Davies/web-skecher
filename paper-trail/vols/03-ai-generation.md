---
status: done        # planned | in-progress | blocked | done
milestone: m1
started: 2026-10-21
completed: 2026-10-21
---

# 03 — AI Generation

## Goal
Implement the provider-agnostic `AIProvider` interface, the MVP OpenAI adapter with bring-your-own-API-key configuration, the multi-stage diagram generation pipeline, diagram style and complexity presets, and runtime Zod schema validation producing a canonical `DiagramSpec`.

## Scope
- [x] Common `AIProvider` TypeScript interface decoupled from UI components
- [x] OpenAI adapter with API key, model selection, generation preferences, and request timeout
- [x] Safe API credential management (no browser sync, no content-script or log exposure)
- [x] Diagram style templates (`flowchart`, `mindmap`, `concept_map`) and complexity presets (`Simple`, `Balanced`, `Detailed`)
- [x] Multi-stage generation pipeline (Analyse → Plan → Validate → Layout → Render)
- [x] Canonical `DiagramSpec`, `DiagramNode`, and `DiagramEdge` schemas and runtime Zod validation
- [x] Error handling and controlled retries for invalid JSON, rate limits, and timeouts

## Out of scope
- Anthropic, Ollama, and Custom OpenAI-compatible adapters (covered in [06 — Additional Connections](./06-additional-connections.md))
- Embedded vendor API keys or managed server-side credential vaults in MVP
- Trusting AI-generated coordinates as final layout positions

## Notes
- **Acceptance criteria:** The reference article reliably generates a valid diagram specification (`DiagramSpec`).
- Consumes `SourceDocument` from [02 — Content Extraction](./02-content-extraction.md) and outputs `DiagramSpec` to [04 — Excalidraw Rendering](./04-excalidraw-rendering.md).

---

## 1. Diagram styles and complexity presets

### 1.1 Diagram style options

**Flowchart**

Best for procedures, decision-making and sequential relationships.

**Mind map**

Best for exploring a central subject and branching ideas.

**Concept map**

Best for explaining relationships among concepts.

Each diagram type must have a corresponding layout strategy and AI instruction template.

### 1.2 Complexity presets

| Preset | Target nodes | Behaviour |
|---|---:|---|
| Simple | 4–8 | Main ideas only, beginner-friendly text |
| Balanced | 8–15 | Major ideas and useful relationships |
| Detailed | 15–30 | Deeper explanation, examples and dependencies |

These are target ranges, not hard limits. Diagrams must prioritise correctness and readability.

---

## 2. AI connection system (Core & OpenAI MVP)

### 2.1 Design requirement

AI provider logic must not be embedded in UI components.

All providers must implement one common interface.

### 2.2 Provider interface

```ts
interface AIProvider {
  id: string;
  name: string;

  validateConfig(): Promise<ConnectionResult>;

  listModels(): Promise<ModelInfo[]>;

  generateDiagram(
    request: DiagramGenerationRequest
  ): Promise<DiagramSpec>;

  refineDiagram(
    request: DiagramRefinementRequest
  ): Promise<DiagramPatch>;
}
```

### 2.3 OpenAI provider configuration (MVP)

Required for MVP.

Settings:

- API key
- Model
- Generation preferences
- Request timeout

### 2.4 API credential management

MVP credentials must not be synchronised across browsers automatically.

The extension must clearly state that ordinary Chrome extension local storage is not a secure secret vault.

Prefer session-only credentials where practical, or an explicitly consented persistent credential mechanism with a documented threat model.

Do not place credentials in content scripts, webpage DOM, URL parameters, analytics, exported diagrams or logs.

Do not embed vendor API keys in the extension package.

For a future managed service, use a server-side credential architecture rather than distributing shared secrets to clients.

---

## 3. Diagram generation engine

### 3.1 Generation stages

The AI pipeline must separate understanding from rendering.

**Stage A — Analyse content**

Identify:

- Main topic
- Important concepts
- Cause-and-effect relationships
- Sequences
- Decisions
- Examples
- Conclusions

**Stage B — Produce diagram plan**

Generate nodes, connections, labels, descriptions and source references.

**Stage C — Validate**

Check schema correctness, valid references, diagram size and unsupported elements.

**Stage D — Layout**

Compute appropriate positions and connector routes.

**Stage E — Render**

Translate the validated diagram into Excalidraw elements.

### 3.2 Canonical diagram specification

```ts
type DiagramType =
  | "flowchart"
  | "mindmap"
  | "concept_map";

interface DiagramSpec {
  schemaVersion: 1;
  id: string;
  title: string;
  type: DiagramType;
  summary: string;
  sourceDocumentId: string;

  nodes: DiagramNode[];
  edges: DiagramEdge[];

  createdAt: string;
}

interface DiagramNode {
  id: string;
  kind:
    | "concept"
    | "process"
    | "decision"
    | "example"
    | "outcome";

  label: string;
  description?: string;

  sourceSectionIds: string[];

  emphasis?: "normal" | "high";
}

interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;

  relationship?:
    | "sequence"
    | "causes"
    | "depends_on"
    | "explains"
    | "alternative";
}
```

The schema must be validated at runtime.

Node and edge IDs must remain stable during refinements.

Each edge must refer to existing nodes.

AI-generated coordinates must not be trusted as the final layout.

### 3.3 Example output

For the Baseline article:

```json
{
  "schemaVersion": 1,
  "id": "baseline-intro",
  "title": "How Baseline Helps Ship Less JavaScript",
  "type": "flowchart",
  "summary": "Check native browser support before depending on JavaScript libraries.",
  "sourceDocumentId": "article-001",
  "nodes": [
    {
      "id": "n1",
      "kind": "process",
      "label": "Identify a JavaScript dependency",
      "sourceSectionIds": ["s1"]
    },
    {
      "id": "n2",
      "kind": "decision",
      "label": "Does the browser provide a native API?",
      "sourceSectionIds": ["s2"]
    },
    {
      "id": "n3",
      "kind": "process",
      "label": "Check Baseline compatibility",
      "sourceSectionIds": ["s3"]
    },
    {
      "id": "n4",
      "kind": "outcome",
      "label": "Use the native API where appropriate",
      "sourceSectionIds": ["s4"]
    },
    {
      "id": "n5",
      "kind": "outcome",
      "label": "Keep a library or fallback if needed",
      "sourceSectionIds": ["s4"]
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "n1",
      "to": "n2"
    },
    {
      "id": "e2",
      "from": "n2",
      "to": "n3",
      "label": "Yes"
    },
    {
      "id": "e3",
      "from": "n2",
      "to": "n5",
      "label": "No"
    },
    {
      "id": "e4",
      "from": "n3",
      "to": "n4",
      "label": "Suitable support"
    },
    {
      "id": "e5",
      "from": "n3",
      "to": "n5",
      "label": "Support insufficient"
    }
  ],
  "createdAt": "2026-10-21T00:00:00Z"
}
```

This is an illustrative fixture. Production content and source-section references must be generated from the actual extracted article.

### 3.4 Diagram correctness requirements

The generation system must:

- Avoid unsupported factual claims
- Preserve important qualifications
- Distinguish source statements from AI-generated examples
- Avoid misleading relationships
- Prefer simple labels
- Avoid excessive text in nodes
- Ensure edges are logically meaningful
- Avoid inventing source references

Source coverage and readability take priority over minimising node count.
