import React, { useState } from 'react';
import type { RefinementHistoryEntry } from '@/shared/types';

const QUICK_PROMPTS = [
  'Explain this diagram more simply',
  'Add practical examples',
  'Change this into a mind map',
  'Expand the selected concept',
  'Remove unnecessary details',
  'Add connections between these concepts',
  'Highlight the most important information',
];

export interface RefinementPanelProps {
  selectedNodeId: string | null;
  hasManualEdits?: boolean;
  refinementHistory?: RefinementHistoryEntry[];
  onApplyInstruction: (instruction: string) => Promise<void>;
}

export const RefinementPanel: React.FC<RefinementPanelProps> = ({
  selectedNodeId,
  hasManualEdits,
  refinementHistory = [],
  onApplyInstruction,
}) => {
  const [instruction, setInstruction] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || busy) return;
    setBusy(true);
    try {
      await onApplyInstruction(instruction.trim());
      setInstruction('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="AI Refinement Panel"
      className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          AI Refinement Panel
        </h2>
        {selectedNodeId && (
          <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-100">
            Target: {selectedNodeId}
          </span>
        )}
      </div>

      {hasManualEdits && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
        >
          Manual edits detected. Applying a refinement automatically creates a
          restorable checkpoint and preserves unaffected node positions.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ask AI to refine the diagram without losing manual edits…"
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          disabled={busy || !instruction.trim()}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Applying Patch…' : 'Apply AI Refinement'}
        </button>
      </form>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Suggested prompts:
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInstruction(prompt)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {refinementHistory.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Recent Refinements ({refinementHistory.length})
          </div>
          <ul className="space-y-1 max-h-28 overflow-y-auto text-[11px] text-slate-600 dark:text-slate-300">
            {refinementHistory.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="rounded border border-slate-100 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-800/50"
              >
                <span className="font-semibold">
                  v{item.fromVersion}→v{item.toVersion}:
                </span>{' '}
                {item.instruction}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
