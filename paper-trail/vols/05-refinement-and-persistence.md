---
status: done        # planned | in-progress | blocked | done
milestone: m1
started: 2026-10-22
completed: 2026-10-22
---

# 05 — Refinement and Persistence

## Goal
Enable natural-language AI follow-ups via targeted `DiagramPatch` operations that preserve manual edits, alongside local IndexedDB and `chrome.storage.local` persistence for saving, versioning, reopening, and recovering diagrams across browser restarts.

## Scope
- [x] AI refinement panel supporting natural-language follow-up instructions
- [x] `DiagramPatch` schema (`add_node`, `update_node`, `remove_node`, `add_edge`, `remove_edge`)
- [x] Conflict detection, automatic checkpoint creation before overwriting manual edits, and partial layout recalculation
- [x] IndexedDB storage for source documents, `DiagramSpec`, Excalidraw scenes, versions, source references, thumbnails, and refinement history
- [x] `chrome.storage.local` persistence for user preferences, active provider, profiles, connections, theme, and onboarding state
- [x] Saved diagram library (reopen, rename, delete with confirmation, storage usage display, clear all data)
- [x] Automatic post-generation saves, debounced manual-edit saves, and crash recovery

## Out of scope
- Cloud accounts, subscriptions, and real-time multi-user sync (P2)
- Unconditional full-scene replacement on follow-up prompts when a targeted patch is possible

## Notes
- **Acceptance criteria:** Users can refine, save, close and reopen diagrams without data loss.
- Builds on [03 — AI Generation](./03-ai-generation.md) and [04 — Excalidraw Rendering](./04-excalidraw-rendering.md).

---

## 1. AI refinement panel

The AI panel must support natural-language instructions such as:

- Explain this diagram more simply
- Add practical examples
- Change this into a mind map
- Expand the selected concept
- Remove unnecessary details
- Add connections between these concepts
- Highlight the most important information

The AI must receive the relevant current diagram state and existing stable node identifiers.

Where possible, follow-up requests must generate targeted changes rather than replace the entire scene.

When regeneration would overwrite manual edits, the system must create a checkpoint and offer the user an explicit choice.

---

## 2. AI refinement and diagram patches

### 2.1 Principle

Once a diagram exists, AI follow-ups should operate on the canonical diagram specification rather than regenerate unrelated content.

### 2.2 Patch schema

```ts
interface DiagramPatch {
  baseDiagramId: string;
  baseVersion: number;

  operations: Array<
    | {
        type: "add_node";
        node: DiagramNode;
      }
    | {
        type: "update_node";
        id: string;
        changes: Partial<DiagramNode>;
      }
    | {
        type: "remove_node";
        id: string;
      }
    | {
        type: "add_edge";
        edge: DiagramEdge;
      }
    | {
        type: "remove_edge";
        id: string;
      }
  >;
}
```

### 2.3 Patch application

The extension must:

1. Load the current diagram version.
2. Generate a patch.
3. Validate all operations.
4. Detect version conflicts.
5. Create a checkpoint.
6. Show change preview where necessary.
7. Apply patch.
8. Recalculate affected layout regions.
9. Preserve unaffected manual edits where feasible.
10. Save updated version.

Invalid patches must be rejected without corrupting the existing diagram.

---

## 3. Local persistence

### 3.1 Storage strategy

Use IndexedDB for:

- Source documents
- Diagram specifications
- Excalidraw scenes
- Diagram versions
- Source-reference mappings
- Generated thumbnails
- AI refinement history where enabled

Use Chrome storage for:

- User preferences
- Selected provider
- Provider profile metadata
- Connection configuration
- Theme
- Onboarding status

### 3.2 Diagram record

```ts
interface SavedDiagram {
  id: string;
  title: string;

  sourceDocumentId: string;
  sourceUrl: string;

  diagramType: DiagramType;

  spec: DiagramSpec;

  scene: unknown;

  providerId: string;
  modelId: string;

  createdAt: string;
  updatedAt: string;

  version: number;
}
```

Replace `unknown` with the supported Excalidraw scene type at implementation time.

### 3.3 Persistence requirements

- Save automatically after generation.
- Debounce saves during manual editing.
- Recover after browser crashes.
- Never overwrite an existing diagram without version tracking.
- Offer delete confirmation.
- Provide local storage usage information.
- Support user-initiated clearing of all stored data.
