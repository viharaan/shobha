'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { publishHeading } from '@/lib/heading';

const fwd = new Vector3();
const up = new Vector3();

/**
 * Publishes the camera's compass heading for the DOM compass. `toBearing` maps a horizontal world
 * direction (dx, dz) to degrees clockwise from north; null = no north reference (compass hidden).
 * Looking straight down (top view) uses screen-up instead of the view direction.
 */
export function HeadingProbe({ toBearing }: { toBearing: ((dx: number, dz: number) => number) | null }) {
  const last = useRef<number | null>(null);
  useEffect(() => () => publishHeading(null), []);
  useFrame(({ camera }) => {
    if (!toBearing) { if (last.current !== null) { last.current = null; publishHeading(null); } return; }
    camera.getWorldDirection(fwd);
    let dx = fwd.x, dz = fwd.z;
    if (Math.hypot(dx, dz) < 0.05) { up.set(0, 1, 0).applyQuaternion(camera.quaternion); dx = up.x; dz = up.z; }
    if (Math.hypot(dx, dz) < 1e-4) return;
    const b = toBearing(dx, dz);
    if (last.current === null || Math.abs(((b - last.current + 540) % 360) - 180) >= 1) { last.current = b; publishHeading(b); }
  });
  return null;
}

/** Site / explorer frame: x = east, z = −north. */
export const siteBearing = (dx: number, dz: number) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
