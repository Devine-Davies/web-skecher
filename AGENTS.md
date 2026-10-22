# paper-trail — Agent Instructions

`paper-trail/` tracks project status. It answers three questions:

- **What is planned?** See `vols/`.
- **What happened, and when?** See `progress/`.
- **Where do things stand now?** See `README.md`.

## Layout

```
paper-trail/
├── AGENTS.md        # this file
├── README.md        # status index (one row per vol)
├── vols/            # units of planned work
│   └── NN-<slug>.md
└── progress/        # append-only, dated log
    └── YYYY-MM-DD-<milestone>.md
```

## Rules

1. **Filenames never encode status.** Never rename a file to mark it done. Status lives only in frontmatter.
2. **Each fact has one source of truth.**
   - Vol status: the vol's frontmatter.
   - Completion history: `progress/`.
   - `README.md` mirrors the vol frontmatter and must agree with it.
3. **`progress/` is append-only.** Never edit or delete past entries. To correct one, add a new entry that references it.
4. **Use stable names.**
   - Vols: `NN-<kebab-slug>.md`, numbered sequentially and never renumbered.
   - Progress entries: `YYYY-MM-DD-<milestone>.md`, using the date the milestone finished. If the same milestone has two entries on one day, add a suffix: `-2`, `-3`, and so on.
5. **Use relative links** between files, for example `../vols/01-auth.md`.

## Vol files (`vols/NN-<slug>.md`)

```markdown
---
status: planned        # planned | in-progress | blocked | done
milestone: m1
started:               # YYYY-MM-DD, set when status first leaves "planned"
completed:             # YYYY-MM-DD, set only when status becomes "done"
---

# NN — <Title>

## Goal
What this vol delivers, in one or two sentences.

## Scope
- [ ] Task
- [ ] Task

## Out of scope
- ...

## Notes
Decisions, blockers, links to PRs and issues.
```

- Only the frontmatter `status` field determines a vol's status. The checkboxes track progress within the vol.
- If `status` is `blocked`, add a line to `## Notes` explaining why.

## Progress entries (`progress/YYYY-MM-DD-<milestone>.md`)

```markdown
---
date: YYYY-MM-DD
milestone: m1
vols: [01, 02]
---

# <Milestone> — <short headline>

## Completed
- [01 — Title](../vols/01-slug.md): what shipped

## Changed from plan
- Anything that was descoped, deferred, or added

## Next
- What follows
```

## README.md index

Keep a single table, sorted by vol number:

```markdown
| Vol | Title | Milestone | Status | Completed |
|-----|-------|-----------|--------|-----------|
| [01](vols/01-slug.md) | Title | m1 | done | 2026-10-21 |
| [02](vols/02-slug.md) | Title | m1 | in-progress | |
```

## Workflows

**Adding a vol**
1. Create `vols/NN-<slug>.md` with the next free number and `status: planned`.
2. Add a row for it to the `README.md` table.

**Starting a vol**
1. Set `status: in-progress` and `started:` in the vol's frontmatter.
2. Update the vol's row in `README.md`.

**Completing a vol**
1. Set `status: done` and `completed:` in the vol's frontmatter.
2. Tick off the remaining scope items, or move them to `## Out of scope`.
3. Update the vol's row in `README.md`.

**Completing a milestone**
1. Check that every vol in the milestone is `done`, or record the exceptions under `## Changed from plan`.
2. Create `progress/YYYY-MM-DD-<milestone>.md`.
3. Do **not** rename or move any vol files.

## Don'ts

- Don't create `*-completed.md` files, or any other status-in-filename variants.
- Don't duplicate vol content in progress entries. Link to the vol instead.
- Don't edit past progress entries.
- Don't renumber vols.
