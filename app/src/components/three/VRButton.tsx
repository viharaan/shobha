'use client';

import { XR_SUPPORT_TEXT, useXRSupport, xrStore } from '@/lib/xr';
import { useState } from 'react';

export function VRButton({ compact = false }: { compact?: boolean }) {
  const support = useXRSupport();
  const [err, setErr] = useState<string | null>(null);
  const enter = async () => {
    setErr(null);
    try {
      await xrStore.enterVR();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the VR session.');
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="btn btn-primary"
        onClick={enter}
        disabled={support !== 'supported'}
        aria-describedby="xr-support-text"
        title={XR_SUPPORT_TEXT[support]}
      >
        <span aria-hidden>◉</span> Enter VR
      </button>
      {!compact && (
        <p id="xr-support-text" className="max-w-xs text-[11px] leading-snug text-fg-muted">
          {XR_SUPPORT_TEXT[support]}
        </p>
      )}
      {err && <p className="text-[11px] text-bad">{err}</p>}
    </div>
  );
}
