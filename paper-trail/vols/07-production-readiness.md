---
status: planned        # planned | in-progress | blocked | done
milestone: m1
started:
completed:
---

# 07 — Production Readiness

## Goal
Ensure **Visualise Page** meets release quality across security and privacy, actionable error handling, stage-measured performance, keyboard and screen-reader accessibility (including textual diagram outlines), automated testing (unit, integration, E2E, security), and Chrome Web Store release packaging.

## Scope
- [ ] Narrowly scoped Chrome permissions (`activeTab`, `scripting`, `sidePanel`, `storage`, `contextMenus`) and MV3 CSP hardening
- [ ] Prompt-injection separation, data-sharing approval flow, and privacy policy disclosures (analytics disabled by default)
- [ ] Actionable error handling and safe recovery across all failure modes
- [ ] Performance validation by pipeline stage and duplicate-job prevention
- [ ] Accessibility audit including keyboard navigation, reduced-motion support, and independent textual diagram outlines
- [ ] Unit, integration, end-to-end (Smashing Magazine Baseline flow), and security test suites
- [ ] Chrome Web Store assets, release packaging, and MVP Definition of Done verification

## Out of scope
- Default-enabled telemetry or third-party analytics in the MVP
- Broad `<all_urls>` host permissions requested upfront by default

## Notes
- **Acceptance criteria:** The extension satisfies release quality checks and the complete primary workflow.
- Validates and hardens [01 — Extension Foundation](./01-extension-foundation.md) through [06 — Additional Connections](./06-additional-connections.md).

---

## 1. Security and privacy

### 1.1 Chrome permissions

Initial permissions should be narrowly scoped.

Likely required:

- `activeTab`
- `scripting`
- `sidePanel`
- `storage`
- `contextMenus`

Additional host permissions must be requested only as needed for configured AI or MCP destinations.

Avoid requesting access to every website by default.

### 1.2 Page content safety

Webpage content must always be treated as untrusted input.

Extracted articles may contain malicious instructions intended to manipulate the AI.

The AI generation prompt must distinguish:

- Trusted application instructions
- User instructions
- Untrusted webpage content

Instructions embedded in an article must not be permitted to change provider settings, invoke arbitrary tools, read additional tabs or disclose credentials.

### 1.3 Data-sharing approval

Before initial external generation, show:

- Source URL
- Approximate content size
- Destination provider
- Whether an MCP server also receives content
- A content preview
- Generate/Cancel actions

The user may choose to remember approval preferences for a provider, while maintaining an accessible privacy control.

### 1.4 Extension security

- Manifest V3-compliant bundled executable code
- Restrictive content security policy
- No remotely hosted extension JavaScript
- No use of `eval`
- Validate external message origins
- Sanitize user-visible HTML
- Restrict extension message routing
- Validate network destinations
- Redact credentials from diagnostics
- Limit network timeouts and retries
- Never execute webpage-provided code as privileged extension code

### 1.5 Privacy policy

The product must clearly disclose:

- Which data stays local
- Which data is sent to AI providers
- Which data is sent to MCP servers
- Whether providers retain submitted information
- How stored diagrams can be deleted
- Whether telemetry is collected

Analytics should be disabled by default in the MVP.

---

## 2. Error handling

The extension must provide clear, actionable errors.

| Failure | Expected response |
|---|---|
| Unsupported page | Explain limitation and offer pasted text |
| Empty extraction | Offer manual text input |
| AI authentication failure | Prompt to recheck API credentials |
| Provider rate limit | Explain limit and allow retry |
| AI timeout | Preserve extraction and retry safely |
| Invalid AI JSON | Retry validation/repair, then show error |
| MCP connection failure | Use local renderer |
| MCP App incompatibility | Explain fallback without losing diagram |
| Browser tab closed | Preserve completed generation artifacts |
| Storage quota reached | Offer cleanup and export |
| Diagram patch conflict | Keep previous version and offer review |

The UI must never display a successful completion state until the resulting diagram exists and has been saved.

---

## 3. Performance requirements

These are engineering targets, not guaranteed timings.

- Side panel should become interactive quickly after opening.
- Article extraction should be efficient on ordinary articles.
- Large articles must be processed without freezing the page.
- Model responses should stream status where supported.
- The editor must remain responsive during layout and rendering.
- Autosaving must not block drawing interactions.
- Network failures must have bounded timeouts.
- Repeated clicks must not trigger duplicate generation jobs.

Measure generation time by stage rather than relying only on total duration.

---

## 4. Accessibility requirements

- Keyboard-operable controls
- Visible focus indicators
- Meaningful button labels
- Screen-reader-friendly status announcements
- Accessible modal dialogs
- Appropriate contrast
- Responsive side-panel layout
- Reduced-motion support
- Text alternatives for diagram contents

Because diagrams are visual, provide a textual outline listing diagram nodes and their relationships.

The textual outline must be available independently of Excalidraw.

---

## 5. Testing strategy

### 5.1 Unit tests

Required coverage:

- Article extraction normalisation
- Diagram schema validation
- Node and edge validation
- Diagram patch operations
- AI provider adapters
- MCP connection state
- Layout conversions
- Storage migrations
- Security-sensitive message validation

### 5.2 Integration tests

Test:

- Chrome tab to extraction
- Extraction to AI request
- AI response to validated DiagramSpec
- DiagramSpec to Excalidraw scene
- Scene persistence and restoration
- Provider switching
- MCP connection and failure fallback
- Regeneration with manual edits

### 5.3 End-to-end tests

Primary test case:

1. Open the Smashing Magazine Baseline article.
2. Open extension side panel.
3. Select OpenAI.
4. Choose Simple Flowchart.
5. Review extracted content.
6. Generate diagram.
7. Verify editable Excalidraw scene.
8. Make a manual edit.
9. Ask AI to add an example.
10. Verify the original diagram remains intact.
11. Save and reopen.
12. Export `.excalidraw` and PNG.
13. Verify exports are valid.

Use mocked AI responses for repeatable automated tests, supplemented with a smaller set of live-provider smoke tests.

### 5.4 Security tests

- Prompt injection in webpage text
- Malicious HTML and script markup
- Invalid MCP responses
- Oversized AI output
- Unauthorised tool execution
- Credential leakage checks
- Unexpected cross-origin requests
- Tab permission expiry
- Broken service worker lifecycle
- Invalid custom endpoints

---

## 6. Engineering milestones overview

### Milestone 1 — Extension foundation ([01 — Extension Foundation](./01-extension-foundation.md))

Deliverables:

- Working MV3 extension
- Toolbar action
- Side panel
- Full-page editor route
- Initial settings
- Build and local installation workflow

**Acceptance:** Extension loads without errors and opens the correct UI.

### Milestone 2 — Content extraction ([02 — Content Extraction](./02-content-extraction.md))

Deliverables:

- Active-tab extraction
- Readability integration
- Content preview
- Structured source document
- Extraction errors

**Acceptance:** The reference article is extracted cleanly without major navigation clutter.

### Milestone 3 — AI generation ([03 — AI Generation](./03-ai-generation.md))

Deliverables:

- OpenAI adapter
- API key configuration
- Diagram generation prompt
- JSON schema validation
- Structured DiagramSpec
- Error and retry handling

**Acceptance:** The article reliably generates a valid diagram specification.

### Milestone 4 — Excalidraw rendering ([04 — Excalidraw Rendering](./04-excalidraw-rendering.md))

Deliverables:

- Local renderer
- Diagram layouts
- Full editor
- Editable nodes
- Save and export

**Acceptance:** A generated diagram can be edited and exported as a valid Excalidraw document.

### Milestone 5 — Refinement and persistence ([05 — Refinement and Persistence](./05-refinement-and-persistence.md))

Deliverables:

- AI follow-ups
- Patch operations
- Diagram checkpoints
- Saved diagram library
- Recovery after browser restart

**Acceptance:** Users can refine, save, close and reopen diagrams without data loss.

### Milestone 6 — Additional connections ([06 — Additional Connections](./06-additional-connections.md))

Deliverables:

- Anthropic adapter
- Ollama adapter
- Custom provider adapter
- MCP configuration UI
- MCP connection testing
- Excalidraw MCP integration proof of concept
- Local renderer fallback

**Acceptance:** Multiple provider types work, and failed MCP connections do not prevent local diagram generation.

### Milestone 7 — Production readiness ([07 — Production Readiness](./07-production-readiness.md))

Deliverables:

- Accessibility audit
- Security review
- Performance tests
- Privacy policy
- Chrome Web Store assets
- Release packaging
- Error reporting strategy

**Acceptance:** The extension satisfies release quality checks and the complete primary workflow.

---

## 7. Definition of done

The MVP is complete only when:

- A user can install the Chrome extension.
- A user can configure their own OpenAI API key.
- A user can open the Smashing Magazine reference article.
- The extension can extract the article's meaningful content.
- The user can review what is being sent.
- The AI can generate a beginner-friendly diagram.
- The diagram is rendered using Excalidraw.
- The user can move, edit, add and delete shapes.
- The user can issue a follow-up instruction.
- The diagram can be saved and reopened.
- The diagram can be exported to standard formats.
- The system recovers safely from common AI and network failures.
- User content and credentials are handled according to the documented privacy and security requirements.

**Successful connection to the hosted Excalidraw MCP App is a P1 integration milestone, not a prerequisite for the functional MVP.**
