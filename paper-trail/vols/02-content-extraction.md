---
status: done        # planned | in-progress | blocked | done
milestone: m1
started: 2026-10-21
completed: 2026-10-21
---

# 02 — Content Extraction

## Goal
Extract the active webpage's main readable content cleanly using Mozilla Readability and DOM APIs, normalize it into a structured `SourceDocument` with section IDs, handle token/context budgets via semantic sectioning, and provide an explicit content preview and approval gate before sending content externally.

## Scope
- [x] Active-tab DOM snapshot extraction via content script
- [x] Mozilla Readability integration and boilerplate removal (navigation, ads, footers, recommendations)
- [x] Preservation of logical heading hierarchy, code examples, lists, and tables
- [x] Normalised `SourceDocument` and `SourceSection` data model with stable section IDs and content hash
- [x] Content preview and user confirmation before external transmission
- [x] Token estimation and hierarchical semantic section summarisation for oversized articles
- [x] Clear error reporting for restricted browser pages, inaccessible frames, and unsupported formats

## Out of scope
- Automatic submission of private form inputs, password fields, or hidden page state
- Silent truncation of oversized articles
- Crawling entire websites or multi-page synthesis (P2)
- PDF and YouTube transcript extraction (P2)

## Notes
- **Acceptance criteria:** The reference article (`https://www.smashingmagazine.com/2026/08/how-baseline-can-help-ship-less-javascript/`) is extracted cleanly without major navigation clutter.
- Depends on [01 — Extension Foundation](./01-extension-foundation.md) and feeds into [03 — AI Generation](./03-ai-generation.md).

---

## 1. Page extraction specification

### 1.1 Supported sources

MVP support:

- Standard HTML articles
- Blogs
- Documentation websites
- Tutorials
- GitHub README content
- Publicly accessible text-heavy pages

Restricted browser pages, inaccessible frames and unsupported document formats must produce a clear explanation instead of failing silently.

### 1.2 Extraction process

1. User invokes Visualise Page.
2. Extension requests temporary access to the active page.
3. Content script reads a snapshot of the page DOM.
4. Extractor identifies the main article region.
5. Remove navigation, advertisements, footers and unrelated recommendations.
6. Preserve logical heading hierarchy.
7. Preserve meaningful code examples.
8. Preserve relevant lists and tables.
9. Convert content into a consistent structured document.
10. Show the extracted content summary before external transmission.

The extension must not automatically submit private form inputs, password fields or hidden page state to AI services.

### 1.3 Extracted document data model

```ts
interface SourceDocument {
  id: string;
  url: string;
  title: string;
  siteName?: string;
  language?: string;
  extractedAt: string;
  contentHash: string;
  sections: SourceSection[];
  wordCount: number;
}

interface SourceSection {
  id: string;
  heading?: string;
  headingLevel?: number;
  text: string;
  type:
    | "paragraph"
    | "heading"
    | "list"
    | "code"
    | "table";
  anchor?: string;
}
```

Every section must receive a stable identifier within the extracted document.

The original source URL and extraction timestamp must be retained.

### 1.4 Content-length handling

The system must estimate token requirements before sending requests.

If content exceeds the selected model's practical context budget:

1. Divide the article by semantic section.
2. Summarise sections individually.
3. Merge their key concepts.
4. Generate the final diagram specification.
5. Retain source references.

Do not truncate the article silently.

The UI must indicate when hierarchical summarisation has been used.

---

## 2. Extraction safety and data-sharing approval

### 2.1 Untrusted webpage content

Webpage content must always be treated as untrusted input.

Extracted articles may contain malicious instructions intended to manipulate the AI.

The AI generation prompt must distinguish:

- Trusted application instructions
- User instructions
- Untrusted webpage content

Instructions embedded in an article must not be permitted to change provider settings, invoke arbitrary tools, read additional tabs or disclose credentials.

### 2.2 Pre-transmission review

Before initial external generation, show:

- Source URL
- Approximate content size
- Destination provider
- Whether an MCP server also receives content
- A content preview
- Generate/Cancel actions

The user may choose to remember approval preferences for a provider, while maintaining an accessible privacy control.
