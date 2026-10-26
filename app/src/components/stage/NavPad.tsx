'use client';

import { sendNav, type NavCommand } from '@/lib/navCommands';

const I = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  rotL: <path d="M4 10a8 8 0 0 1 14-4l2 2M20 3v5h-5" />,
  rotR: <path d="M20 10a8 8 0 0 0-14-4L4 8M4 3v5h5" />,
  tilt: <path d="M3 17l9 4 9-4M3 12l9 4 9-4M3 7l9-4 9 4-9 4z" />,
};

const Btn = ({ cmd, icon, title }: { cmd: NavCommand; icon: React.ReactNode; title: string }) => (
  <button type="button" className="grid h-10 w-10 place-items-center text-fg transition-colors hover:bg-surface-2 active:bg-accent active:text-black" title={title} aria-label={title} onClick={() => sendNav(cmd)} onPointerDown={(e) => e.stopPropagation()}>
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
  </button>
);

const Group = ({ children, row = false }: { children: React.ReactNode; row?: boolean }) => (
  <div className={`flex overflow-hidden rounded-lg border border-line bg-surface/95 shadow-lg backdrop-blur ${row ? 'flex-row divide-x divide-line' : 'flex-col divide-y divide-line'}`}>{children}</div>
);

/** Map-style camera controls (as in Google / Apple Maps): rotate pair, tilt toggle, zoom. Panning is drag. */
export function NavPad({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-auto flex flex-col items-end gap-2 ${className}`} role="group" aria-label="Camera controls">
      <Group row>
        <Btn cmd="rotateLeft" icon={I.rotL} title="Rotate left" />
        <Btn cmd="rotateRight" icon={I.rotR} title="Rotate right" />
      </Group>
      <Group>
        <Btn cmd="tiltToggle" icon={I.tilt} title="Tilt: top view / perspective" />
      </Group>
      <Group>
        <Btn cmd="zoomIn" icon={I.plus} title="Zoom in" />
        <Btn cmd="zoomOut" icon={I.minus} title="Zoom out" />
      </Group>
    </div>
  );
}
