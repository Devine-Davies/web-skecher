import React from 'react';
import { GENERATION_STAGES } from '@/shared/constants';
import type { GenerationStageId } from '@/shared/types';

export interface StageProgressProps {
  activeStage: GenerationStageId | null;
  completedStages: GenerationStageId[];
}

export const StageProgress: React.FC<StageProgressProps> = ({
  activeStage,
  completedStages,
}) => {
  if (!activeStage && completedStages.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Diagram generation progress"
      aria-live="polite"
      className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-100">
        Generation Pipeline Status
      </div>
      <ol className="space-y-1.5">
        {GENERATION_STAGES.map((stage) => {
          const isCompleted = completedStages.includes(stage.id);
          const isActive = activeStage === stage.id;
          return (
            <li
              key={stage.id}
              className="flex items-center justify-between text-xs"
            >
              <span
                className={`flex items-center gap-2 ${
                  isCompleted
                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                    : isActive
                      ? 'font-semibold text-brand-700 dark:text-brand-100'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    isCompleted
                      ? 'bg-emerald-600 text-white'
                      : isActive
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {isCompleted ? '✓' : stage.stepNumber}
                </span>
                {stage.label}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isCompleted ? 'Done' : isActive ? 'In progress…' : 'Pending'}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
