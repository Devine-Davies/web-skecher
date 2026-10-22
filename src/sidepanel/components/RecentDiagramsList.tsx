import React, { useState } from 'react';
import type { SavedDiagram } from '@/shared/types';

export interface RecentDiagramsListProps {
  diagrams: SavedDiagram[];
  onOpenDiagram: (diagramId: string) => void;
  onDeleteDiagram: (diagramId: string) => void;
  onRenameDiagram?: (diagramId: string, newTitle: string) => void;
}

export const RecentDiagramsList: React.FC<RecentDiagramsListProps> = ({
  diagrams,
  onOpenDiagram,
  onDeleteDiagram,
  onRenameDiagram,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  const startRename = (diagram: SavedDiagram) => {
    setEditingId(diagram.id);
    setEditingTitle(diagram.title);
  };

  const commitRename = (diagramId: string) => {
    if (editingTitle.trim() && onRenameDiagram) {
      onRenameDiagram(diagramId, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <section
      aria-label="Recent saved diagrams"
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Recent Diagrams ({diagrams.length})
        </h2>
      </div>

      {diagrams.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No saved diagrams yet. Click Visualise Page above to generate your first diagram.
        </p>
      ) : (
        <ul className="space-y-2">
          {diagrams.slice(0, 6).map((diagram) => (
            <li
              key={diagram.id}
              className="rounded-lg border border-slate-100 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-800/50 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {editingId === diagram.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        aria-label={`New title for ${diagram.title}`}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => commitRename(diagram.id)}
                        className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                      {diagram.title}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="capitalize">
                      {diagram.diagramType.replace('_', ' ')}
                    </span>
                    <span>•</span>
                    <span>{diagram.spec.nodes.length} nodes</span>
                    <span>•</span>
                    <span>v{diagram.version}</span>
                    <span>•</span>
                    <span>
                      {diagram.generationMode === 'live_ai'
                        ? `⚡ Live AI (${diagram.providerId})`
                        : 'Local Heuristic'}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenDiagram(diagram.id)}
                    className="rounded bg-brand-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
                    aria-label={`Open ${diagram.title} in full editor`}
                  >
                    Open
                  </button>
                  {onRenameDiagram && editingId !== diagram.id && (
                    <button
                      type="button"
                      onClick={() => startRename(diagram)}
                      className="rounded border border-slate-200 px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                      aria-label={`Rename ${diagram.title}`}
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(diagram.id)}
                    className="rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-slate-800"
                    aria-label={`Delete ${diagram.title}`}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {confirmDeleteId === diagram.id && (
                <div
                  role="alert"
                  className="flex items-center justify-between rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                >
                  <span>Delete &ldquo;{diagram.title}&rdquo;?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        onDeleteDiagram(diagram.id);
                      }}
                      className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
