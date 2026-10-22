---
status: done        # planned | in-progress | blocked | done
milestone: m1
started: 2026-10-21
completed: 2026-10-21
---

# 04 — Excalidraw Rendering

## Goal
Translate validated `DiagramSpec` structures into positioned, accessible Excalidraw scenes rendered inside a full-page `@excalidraw/excalidraw` editor tab with full shape editing and export support (`.excalidraw`, SVG, PNG).

## Scope
- [x] Automatic layout calculation (flowchart top-to-bottom, mind map radial/central, concept map graph) using Dagre or ELK.js
- [x] Local renderer translating `DiagramSpec` nodes and edges into Excalidraw shapes, arrows, and bound text
- [x] Visual conventions by node kind (`concept`, `process`, `decision`, `example`, `outcome`) with accessible shape + colour differentiation
- [x] Full-page editor tab integrating `@excalidraw/excalidraw`
- [x] Dual storage of canonical `DiagramSpec` alongside the Excalidraw scene
- [x] Export controls for `.excalidraw`, SVG, and PNG formats

## Out of scope
- Relying on hosted MCP App rendering as the primary or sole copy of a diagram
- Colour-only semantic encoding without shape/label differentiation

## Notes
- **Acceptance criteria:** A generated diagram can be edited and exported as a valid Excalidraw document.
- Consumes `DiagramSpec` from [03 — AI Generation](./03-ai-generation.md) and integrates with [05 — Refinement and Persistence](./05-refinement-and-persistence.md).

---

## 1. Full-page diagram editor

The full-page editor must contain:

- Real Excalidraw canvas
- Diagram title
- Source page information
- Save status
- Export control
- AI refinement panel
- Diagram history
- Source references
- Undo/redo through the Excalidraw editor
- Return-to-source action

Users must be able to edit all generated shapes using standard Excalidraw controls.

---

## 2. Excalidraw rendering specification

### 2.1 Renderer responsibilities

The Excalidraw renderer must:

1. Accept a validated DiagramSpec.
2. Calculate node layout.
3. Convert nodes into Excalidraw shapes.
4. Convert edges into arrows.
5. Create text elements.
6. Bind appropriate labels and arrows.
7. Set element style.
8. Fit the canvas to the diagram.
9. Update the editor.
10. Save the resulting scene.

### 2.2 Visual conventions

| Node type | Shape | Suggested appearance |
|---|---|---|
| Concept | Rounded rectangle | Blue |
| Process | Rectangle | Purple |
| Decision | Diamond | Amber |
| Example | Rounded rectangle | Neutral |
| Outcome | Rounded rectangle | Green |

Colour must not be the only means of communicating meaning.

Use shapes, labels and accessible contrast.

### 2.3 Layout rules

Flowcharts should prefer top-to-bottom direction.

Mind maps should place the central concept near the centre with appropriately spaced branches.

Concept maps may use a graph layout with labelled connectors.

Minimum node padding, text wrapping and edge spacing must be controlled by the renderer.

Avoid overlapping labels, intersecting nodes and unreadably long connections.

### 2.4 Excalidraw library

Use the official Excalidraw React package:

`@excalidraw/excalidraw`

The editor should use documented APIs for scene updates, exports and restoration.

The renderer must store both:

- Canonical DiagramSpec
- Corresponding Excalidraw scene

This enables AI modifications while preserving manual canvas changes.
