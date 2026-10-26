'use client';

import { XR_SUPPORT_TEXT, useXRSupport, xrStore } from '@/lib/xr';
import { useState } from 'react';

/**
 * Enter VR. The compact form (the stage dock) appears only when the browser reports an immersive-VR device, so
 * laptops and phones never see a dead button; the full form keeps the explanation of why VR is unavailable.
 */
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
  if (compact && support !== 'supported') return null;
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
