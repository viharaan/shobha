'use client';

/**
 * Minimal bottom bar for sales conversations: what is on screen, and Exit. Shown when the stage is in presentation
 * mode (everything else hidden).
 */
export function PresentationBar({ label, onExit }: { label: string; onExit: () => void }) {
  return (
    <div className="glass pointer-events-auto absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5">
      <span className="truncate text-sm text-fg">{label}</span>
      <button type="button" className="btn" onClick={onExit}>Exit</button>
    </div>
  );
}
