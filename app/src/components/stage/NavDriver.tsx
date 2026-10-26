'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { subscribeNav, type NavCommand } from '@/lib/navCommands';

type ControlsLike = { target: Vector3; minDistance?: number; maxDistance?: number; minPolarAngle?: number; maxPolarAngle?: number; update: () => void } | null;

const offset = new Vector3();
const right = new Vector3();
const fwd = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Applies nav-pad commands to the canvas's default OrbitControls: 15° turns, ×0.8 / ×1.25 zoom, pans of 15 % of the viewing distance. */
export function NavDriver() {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike;
  const camera = useThree((s) => s.camera);
  useEffect(() => subscribeNav((c: NavCommand) => {
    if (!controls || typeof controls.target?.clone !== 'function') return; // walk / VR: no orbit controls
    const t = controls.target;
    offset.copy(camera.position).sub(t);
    const d = offset.length();
    switch (c) {
      case 'rotateLeft':
      case 'rotateRight': {
        offset.applyAxisAngle(UP, (c === 'rotateLeft' ? 1 : -1) * (15 * Math.PI) / 180);
        break;
      }
      case 'tiltUp':
      case 'tiltDown':
      case 'tiltToggle': {
        // polar angle: tilt the view up (toward the horizon) or down (toward top view), within the controls' limits;
        // the toggle jumps between a near-top view (8°) and a 55° perspective like the Tilt button on map apps
        const polar = Math.acos(Math.max(-1, Math.min(1, offset.y / d)));
        const want = c === 'tiltToggle' ? (polar < (25 * Math.PI) / 180 ? (55 * Math.PI) / 180 : (8 * Math.PI) / 180) : polar + (c === 'tiltUp' ? 1 : -1) * (10 * Math.PI) / 180;
        const next = Math.max(controls.minPolarAngle ?? 0.05, Math.min(controls.maxPolarAngle ?? Math.PI / 2 - 0.03, want));
        const az = Math.atan2(offset.x, offset.z);
        offset.set(Math.sin(next) * Math.sin(az) * d, Math.cos(next) * d, Math.sin(next) * Math.cos(az) * d);
        break;
      }
      case 'zoomIn':
      case 'zoomOut': {
        const k = c === 'zoomIn' ? 0.8 : 1.25;
        const nd = Math.max(controls.minDistance ?? 0.5, Math.min(controls.maxDistance ?? Infinity, d * k));
        offset.setLength(nd);
        break;
      }
      default: {
        // pan in screen space: right = camera right, up = the horizontal forward (so the ground slides under the view)
        right.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
        fwd.copy(offset).multiplyScalar(-1); fwd.y = 0;
        if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1).applyQuaternion(camera.quaternion); fwd.y = 0;
        fwd.normalize();
        const step = Math.max(0.5, d * 0.15);
        const mv = c === 'panLeft' ? right.multiplyScalar(-step) : c === 'panRight' ? right.multiplyScalar(step) : c === 'panUp' ? fwd.multiplyScalar(step) : fwd.multiplyScalar(-step);
        t.add(mv);
        break;
      }
    }
    camera.position.copy(t).add(offset);
    controls.update();
  }), [controls, camera]);
  return null;
}
