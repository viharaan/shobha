// Runnable check for the navigation maths: `node --experimental-strip-types scripts/check-nav.mjs`
// (no test framework in this repo; this fails loudly if collision or head-relative placement breaks)
import assert from 'node:assert/strict';
import { Object3D, Vector3, Quaternion } from 'three';
import { RES, isFree, nearestFree, rigPoseForHead, slide, yawToward } from '../src/lib/planNav.ts';

// 4 m x 4 m grid, wall column at x in [2.0, 2.2) except a 1 m doorway at z in [1.5, 2.5)
const nx = 80, nz = 80;
const blocked = new Uint8Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 40; i < 44; i++) { const z = (j + 0.5) * RES; if (z < 1.5 || z >= 2.5) blocked[j * nx + i] = 1; }
/** @type {import('../src/lib/planNav').NavGrid} */
const g = { x0: 0, z0: 0, nx, nz, blocked, wall: blocked, clear: new Float32Array(nx * nz).fill(1) };

// walking east into the wall stops before it, never inside
let p = [1, 0.5];
for (let k = 0; k < 100; k++) p = slide(g, p[0], p[1], p[0] + 0.03, p[1]);
assert.ok(p[0] < 2.0 && p[0] > 1.9, `stopped at wall, got x=${p[0]}`);
assert.ok(isFree(g, p[0], p[1]));

// a diagonal push slides along the wall (z keeps changing)
const before = p[1];
for (let k = 0; k < 20; k++) p = slide(g, p[0], p[1], p[0] + 0.03, p[1] + 0.03);
assert.ok(p[1] > before + 0.4 && p[0] < 2.0, 'slides along the wall');

// through the doorway it passes
p = [1, 2];
for (let k = 0; k < 60; k++) p = slide(g, p[0], p[1], p[0] + 0.03, p[1]);
assert.ok(p[0] > 2.5, `passes doorway, got x=${p[0]}`);

// leaving the grid is blocked (no walking off into the void)
p = [3.9, 1];
for (let k = 0; k < 20; k++) p = slide(g, p[0], p[1], p[0] + 0.03, p[1]);
assert.ok(p[0] < 4.0);

// nearest free from inside the wall lands beside it
const nf = nearestFree(g, 2.1, 0.5);
assert.ok(nf && isFree(g, nf[0], nf[1]) && Math.abs(nf[0] - 2.1) < 0.2);

// head-relative placement: player stands 0.6 m off-centre in their play space, looking 40° left
for (const spotYaw of [0, 1.1, -2.5, Math.PI]) {
  const spot = { x: 3, z: -1, yaw: spotYaw };
  const headLocal = new Vector3(0.6, 1.6, -0.4), headYawInRig = (40 * Math.PI) / 180;
  const r = rigPoseForHead(spot, headLocal.x, headLocal.z, headYawInRig, 0.3);
  const rig = new Object3D(); rig.position.set(r.x, r.y, r.z); rig.rotation.y = r.yaw;
  const head = new Object3D(); head.position.copy(headLocal); head.rotation.y = headYawInRig; rig.add(head);
  rig.updateMatrixWorld(true);
  const w = head.getWorldPosition(new Vector3());
  assert.ok(Math.abs(w.x - spot.x) < 1e-9 && Math.abs(w.z - spot.z) < 1e-9, `head lands on spot (yaw ${spotYaw})`);
  const f = new Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new Quaternion()));
  const worldYaw = Math.atan2(-f.x, -f.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(worldYaw - spotYaw), Math.cos(worldYaw - spotYaw))) < 1e-9, `faces spot.yaw (${spotYaw})`);
}

// yawToward: facing north (−z) is 0, facing east (+x) is −π/2
assert.ok(Math.abs(yawToward(0, 0, 0, -1)) < 1e-12);
assert.ok(Math.abs(yawToward(0, 0, 1, 0) + Math.PI / 2) < 1e-12);

console.log('check-nav: all assertions passed');
