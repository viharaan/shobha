'use client';

import { PointerLockControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import type { NavSpot } from '@/lib/planNav';

const fwd = new Vector3();
const right = new Vector3();
const want = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Desktop first-person walk: click the canvas to lock the pointer, WASD / arrows to move, Shift to run,
 * Esc to release. Eye height fixed at `eyeHeight` above `floorY`. Movement eases in/out (frame-rate
 * independent) and, when `collide` is given, slides along walls and furniture instead of passing through.
 * `spot` (re)places the walker; change its identity to jump (room selection, reset).
 */
export function FirstPersonRig({ eyeHeight = 1.6, floorY = 0, speed = 1.8, spot, collide }: {
  eyeHeight?: number; floorY?: number; speed?: number; spot?: NavSpot;
  collide?: (fx: number, fz: number, tx: number, tz: number) => [number, number];
}) {
  const keys = useRef<Record<string, boolean>>({});
  const vel = useRef(new Vector3());
  const placed = useRef<NavSpot | null | undefined>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const blur = () => { keys.current = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (placed.current !== spot) {
      const s = spot ?? { x: 0, z: 4, yaw: 0 };
      const yaw = s.yaw ?? 0;
      camera.position.set(s.x, floorY + eyeHeight, s.z);
      camera.lookAt(s.x - Math.sin(yaw), floorY + eyeHeight, s.z - Math.cos(yaw));
      vel.current.set(0, 0, 0);
      placed.current = spot;
    }
    const k = keys.current;
    const run = k.ShiftLeft || k.ShiftRight ? 2.2 : 1;
    let dx = 0, dz = 0;
    if (k.KeyW || k.ArrowUp) dz += 1;
    if (k.KeyS || k.ArrowDown) dz -= 1;
    if (k.KeyD || k.ArrowRight) dx += 1;
    if (k.KeyA || k.ArrowLeft) dx -= 1;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, UP).normalize();
    want.set(0, 0, 0);
    if (dx || dz) want.addScaledVector(fwd, dz).addScaledVector(right, dx).normalize().multiplyScalar(speed * run);
    vel.current.lerp(want, 1 - Math.exp(-dt / 0.1));
    if (vel.current.lengthSq() < 1e-6) return;
    const tx = camera.position.x + vel.current.x * dt, tz = camera.position.z + vel.current.z * dt;
    const [nx, nz] = collide ? collide(camera.position.x, camera.position.z, tx, tz) : [tx, tz];
    camera.position.set(nx, floorY + eyeHeight, nz);
  });

  return <PointerLockControls makeDefault />;
}
