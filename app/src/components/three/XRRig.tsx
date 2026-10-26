'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { TeleportTarget, XROrigin } from '@react-three/xr';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { Box3, Euler, Matrix4, Quaternion, Ray, Vector3, type Group } from 'three';
import { invalidateNavPose, publishNavPose } from '@/lib/navPose';
import { rigPoseForHead, type NavSpot } from '@/lib/planNav';
import { xrStore } from '@/lib/xr';

export type { NavSpot };
export type RigMode = 'walk' | 'top';
export interface XRRigHandle {
  /** Put the player's HEAD at spot (x, z), rig floor at spot.y, facing spot.yaw. Interruptible; 0 = instant. */
  flyTo: (spot: NavSpot, seconds?: number) => void;
  /** Panel buttons: snap-turn about the head (radians, + = left), step in the head's frame (metres: right, forward), scale the height in top mode. */
  turn: (rad: number) => void;
  nudge: (right: number, forward: number) => void;
  zoom: (factor: number) => void;
}

const DEAD = 0.15;
const SNAP_RAD = (30 * Math.PI) / 180;
const ACCEL_T = 0.12; // s, time constant to reach stick speed (responsive, not floaty)
const head = new Vector3();
const headL = new Vector3();
const q = new Quaternion();
const fwd = new Vector3();
const want = new Vector3();

/** Hand tracking: thumb-tip / index-tip gap that counts as a pinch (m), with release hysteresis. */
const PINCH_ON = 0.022;
const PINCH_OFF = 0.035;
/** One pinched hand drags the world: hand motion × this = rig motion (walk mode; top mode scales with height). */
const GRAB_GAIN = 3;
type HandTrack = { pinch: boolean; x: number; y: number; z: number };

const ctrls0 = (states: readonly { type: string }[]) => states.filter((s) => s.type === 'controller').length;
const headingYaw = (camQ: Quaternion) => { fwd.set(0, 0, -1).applyQuaternion(camQ); return Math.atan2(-fwd.x, -fwd.z); };
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function readStick(s: { inputSource: XRInputSource; gamepad?: Record<string, { xAxis?: number; yAxis?: number } | undefined> }): [number, number] {
  const axes = s.inputSource.gamepad?.axes;
  if (axes && axes.length >= 4) return [axes[2], axes[3]];
  const t = s.gamepad?.['xr-standard-thumbstick'] ?? s.gamepad?.['xr-standard-touchpad'];
  if (t) return [t.xAxis ?? 0, t.yAxis ?? 0];
  return axes && axes.length >= 2 ? [axes[0], axes[1]] : [0, 0];
}

/**
 * Player rig for VR. Children ride with the player (the anchored panel).
 *
 *   walk: left stick moves where you look, eased in/out; `collide` slides you along walls and furniture;
 *         floor-locked. Right stick ←/→ snap-turns 30° about your head.
 *   top:  left stick pans (speed scales with height); right stick ↑/↓ zooms (lowers/raises you within
 *         topRange); ←/→ still snap-turns.
 *   Right trigger on the floor teleports (handled by TeleportFloor → flyTo).
 *
 * Raw xr-standard gamepad axes are read so one or two controllers work without a controller-profile
 * download. All moves place the HEAD, not the rig origin, so where you physically stand in your play
 * space never offsets a room jump.
 */
export const XRRig = forwardRef<XRRigHandle, {
  start: NavSpot; mode: RigMode; walkSpeed?: number; topRange?: [number, number];
  collide?: (fx: number, fz: number, tx: number, tz: number) => [number, number];
  children?: ReactNode;
}>(function XRRig({ start, mode, walkSpeed = 1.5, topRange = [4, 30], collide, children }, handle) {
  const ref = useRef<Group>(null);
  const canSnap = useRef(true);
  const vel = useRef(new Vector3());
  const fly = useRef<{ p0: Vector3; p1: Vector3; y0: number; y1: number; t: number; dur: number } | null>(null);
  const pending = useRef<{ spot: NavSpot; dur: number } | null>(null);
  const inSession = useRef(false);
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; }, [start]);

  const cmd = useRef<{ turn?: number; right?: number; forward?: number; zoom?: number } | null>(null);
  const gl = useThree((st) => st.gl);
  const hands = useRef<{ left: HandTrack; right: HandTrack }>({ left: { pinch: false, x: 0, y: 0, z: 0 }, right: { pinch: false, x: 0, y: 0, z: 0 } });
  const twoHand = useRef<{ dist: number; ang: number } | null>(null);
  useImperativeHandle(handle, () => ({
    flyTo: (spot, seconds = 0.45) => { pending.current = { spot, dur: seconds }; },
    turn: (rad) => { cmd.current = { ...(cmd.current ?? {}), turn: rad }; },
    nudge: (right, forward) => { cmd.current = { ...(cmd.current ?? {}), right, forward }; },
    zoom: (factor) => { cmd.current = { ...(cmd.current ?? {}), zoom: factor }; },
  }), []);

  useFrame(({ camera }, rawDt) => {
    const rig = ref.current;
    const { session, inputSourceStates } = xrStore.getState();
    if (!rig || !session) { inSession.current = false; return; }
    const dt = Math.min(rawDt, 0.05);
    camera.getWorldPosition(head);
    camera.getWorldQuaternion(q);
    rig.updateWorldMatrix(true, false);
    headL.copy(head);
    rig.worldToLocal(headL);

    // entering VR: wait one tracked frame, then spawn at start
    if (!inSession.current) { inSession.current = true; pending.current = { spot: startRef.current, dur: 0 }; return; }

    if (pending.current) {
      const { spot, dur } = pending.current;
      pending.current = null;
      const r = rigPoseForHead(spot, headL.x, headL.z, headingYaw(q) - rig.rotation.y, rig.rotation.y);
      const y1 = r.yaw;
      const p1 = new Vector3(r.x, r.y, r.z);
      vel.current.set(0, 0, 0);
      if (dur <= 0) { rig.position.copy(p1); rig.rotation.y = y1; fly.current = null; }
      else fly.current = { p0: rig.position.clone(), p1, y0: rig.rotation.y, y1, t: 0, dur };
      return;
    }

    if (fly.current) {
      const f = fly.current;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = ease(f.t);
      rig.position.lerpVectors(f.p0, f.p1, k);
      rig.rotation.y = lerpAngle(f.y0, f.y1, k);
      if (f.t >= 1) fly.current = null;
      return;
    }

    // panel buttons (one-shot): turn about the head, step in the head's horizontal frame, zoom (top mode)
    if (cmd.current) {
      const c = cmd.current;
      cmd.current = null;
      if (c.turn) {
        const dx = rig.position.x - head.x, dz = rig.position.z - head.z;
        rig.position.x = head.x + dx * Math.cos(c.turn) + dz * Math.sin(c.turn);
        rig.position.z = head.z - dx * Math.sin(c.turn) + dz * Math.cos(c.turn);
        rig.rotation.y += c.turn;
      }
      if (c.right || c.forward) {
        fwd.set(0, 0, -1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
        const tx = head.x + fwd.x * (c.forward ?? 0) + -fwd.z * (c.right ?? 0);
        const tz = head.z + fwd.z * (c.forward ?? 0) + fwd.x * (c.right ?? 0);
        const [nx, nz] = mode === 'walk' && collide ? collide(head.x, head.z, tx, tz) : [tx, tz];
        rig.position.x += nx - head.x;
        rig.position.z += nz - head.z;
      }
      if (c.zoom && mode === 'top') { const [lo, hi] = topRange; rig.position.y = Math.min(hi, Math.max(lo, rig.position.y * c.zoom)); }
    }

    // Hand tracking (no controllers): pinch and drag to pull the world past you; pinch with both hands and
    // move them apart / together to zoom (top mode) and turn them about each other to rotate. Joint poses
    // come from the XR frame in the reference space, i.e. the rig's own frame, so deltas are head-relative.
    const handStates = inputSourceStates.filter((s) => s.type === 'hand' && s.inputSource.hand);
    if (handStates.length && ctrls0(inputSourceStates) === 0) {
      const frame = gl.xr.getFrame();
      const space = gl.xr.getReferenceSpace();
      if (frame && space) {
        const prev = { left: { ...hands.current.left }, right: { ...hands.current.right } };
        for (const s of handStates) {
          const side = s.inputSource.handedness === 'left' ? 'left' : 'right';
          const h = s.inputSource.hand!;
          const thumb = h.get('thumb-tip'), index = h.get('index-finger-tip');
          const tp = thumb && frame.getJointPose?.(thumb, space), ip = index && frame.getJointPose?.(index, space);
          const t = hands.current[side];
          if (!tp || !ip) { t.pinch = false; continue; }
          const gap = Math.hypot(tp.transform.position.x - ip.transform.position.x, tp.transform.position.y - ip.transform.position.y, tp.transform.position.z - ip.transform.position.z);
          t.pinch = t.pinch ? gap < PINCH_OFF : gap < PINCH_ON;
          t.x = (tp.transform.position.x + ip.transform.position.x) / 2; t.y = (tp.transform.position.y + ip.transform.position.y) / 2; t.z = (tp.transform.position.z + ip.transform.position.z) / 2;
        }
        const L = hands.current.left, R = hands.current.right;
        const pinched = [L.pinch ? 'left' : null, R.pinch ? 'right' : null].filter(Boolean) as ('left' | 'right')[];
        const cy = Math.cos(rig.rotation.y), sy = Math.sin(rig.rotation.y);
        const toWorld = (dx: number, dz: number): [number, number] => [dx * cy + dz * sy, -dx * sy + dz * cy];
        if (pinched.length === 2 && prev.left.pinch && prev.right.pinch) {
          const dist = Math.hypot(R.x - L.x, R.z - L.z), ang = Math.atan2(R.z - L.z, R.x - L.x);
          if (twoHand.current) {
            if (mode === 'top' && twoHand.current.dist > 0.02) { const [lo, hi] = topRange; rig.position.y = Math.min(hi, Math.max(lo, rig.position.y * (twoHand.current.dist / Math.max(0.02, dist)))); }
            const da = twoHand.current.ang - ang; // hands turned clockwise → view turns with them
            if (Math.abs(da) < 0.5) {
              const dx = rig.position.x - head.x, dz = rig.position.z - head.z;
              rig.position.x = head.x + dx * Math.cos(da) + dz * Math.sin(da);
              rig.position.z = head.z - dx * Math.sin(da) + dz * Math.cos(da);
              rig.rotation.y += da;
            }
          }
          twoHand.current = { dist, ang };
        } else {
          twoHand.current = null;
          if (pinched.length === 1) {
            const side = pinched[0];
            const cur = hands.current[side], was = prev[side];
            if (was.pinch) {
              const gain = mode === 'top' ? Math.max(GRAB_GAIN, rig.position.y * 0.35) : GRAB_GAIN;
              const [wx, wz] = toWorld((cur.x - was.x) * -gain, (cur.z - was.z) * -gain);
              const tx = head.x + wx, tz = head.z + wz;
              const [nx, nz] = mode === 'walk' && collide ? collide(head.x, head.z, tx, tz) : [tx, tz];
              rig.position.x += nx - head.x;
              rig.position.z += nz - head.z;
            }
          }
        }
      }
    } else { hands.current.left.pinch = false; hands.current.right.pinch = false; twoHand.current = null; }

    let mx = 0, mz = 0, rx = 0, ry = 0;
    const ctrls = inputSourceStates.filter((s) => s.type === 'controller');
    for (const s of ctrls) {
      const [x, y] = readStick(s as never);
      if (s.inputSource.handedness === 'right') { rx = x; ry = y; } else { mx += x; mz += y; }
    }
    if (ctrls.length === 1 && ctrls[0].inputSource.handedness === 'right') { mz = ry; ry = 0; } // one controller: its stick walks

    const mag = Math.min(1, Math.hypot(mx, mz));
    const speed = mode === 'top' ? Math.max(2, rig.position.y * 0.5) : walkSpeed;
    want.set(0, 0, 0);
    if (mag > DEAD) {
      fwd.set(0, 0, -1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
      const s = ((mag - DEAD) / (1 - DEAD)) * speed / mag; // analog: half push = half speed
      want.set(-fwd.z, 0, fwd.x).multiplyScalar(mx * s).addScaledVector(fwd, -mz * s);
    }
    vel.current.lerp(want, 1 - Math.exp(-dt / ACCEL_T));
    if (vel.current.lengthSq() > 1e-6) {
      const tx = head.x + vel.current.x * dt, tz = head.z + vel.current.z * dt;
      const [nx, nz] = mode === 'walk' && collide ? collide(head.x, head.z, tx, tz) : [tx, tz];
      if (nx === head.x && nz === head.z) vel.current.set(0, 0, 0); // hit a corner: stop, don't keep pushing
      rig.position.x += nx - head.x;
      rig.position.z += nz - head.z;
    }

    if (mode === 'top' && Math.abs(ry) > DEAD) {
      const [lo, hi] = topRange;
      rig.position.y = Math.min(hi, Math.max(lo, rig.position.y * Math.exp(ry * dt * 1.4))); // push forward (y<0) = zoom in
    }
    if (mode === 'walk' && rig.position.y !== 0) rig.position.y = 0;

    if (Math.abs(rx) < DEAD) canSnap.current = true;
    else if (canSnap.current && Math.abs(rx) > 0.6) {
      canSnap.current = false;
      const a = rx > 0 ? -SNAP_RAD : SNAP_RAD;
      const dx = rig.position.x - head.x, dz = rig.position.z - head.z; // pivot about the head
      rig.position.x = head.x + dx * Math.cos(a) + dz * Math.sin(a);
      rig.position.z = head.z - dx * Math.sin(a) + dz * Math.cos(a);
      rig.rotation.y += a;
    }
  });

  return <XROrigin ref={ref}>{children}</XROrigin>;
});

/** Writes the active viewer's pose (orbit camera / walker / XR head) to the shared navPose store. */
export function PosePublisher() {
  const v = useMemo(() => new Vector3(), []);
  const f = useMemo(() => new Vector3(), []);
  useEffect(() => () => invalidateNavPose(), []);
  useFrame(({ camera }) => {
    camera.getWorldPosition(v);
    camera.getWorldDirection(f);
    publishNavPose(v.x, v.z, f.x, f.z);
  });
  return null;
}

/** Default spot in the player's frame for the panel: low and to the left like a wrist menu, turned to face the eyes. */
export const XR_PANEL_ANCHOR = { position: [-0.42, 0.95, -0.42] as [number, number, number], rotation: [-0.55, 0.6, 0.12] as [number, number, number] };

// Where the player last dragged the panel (rig frame). Module-level so it survives re-renders and route changes.
const panelPose = {
  position: new Vector3(...XR_PANEL_ANCHOR.position),
  quaternion: new Quaternion().setFromEuler(new Euler(...XR_PANEL_ANCHOR.rotation)),
};
const box = new Box3();
const ray = new Ray();
const ctrlPos = new Vector3();
const ctrlQ = new Quaternion();
const m = new Matrix4();
const inv = new Matrix4();
const scaleTmp = new Vector3();

/**
 * Anchor for the in-VR panel. Hold the GRIP (squeeze) button while pointing at the panel, or with the hand
 * inside it, to drag it anywhere; release to drop. Uses raw gamepad button 1 (xr-standard squeeze) and the
 * controller's grip object, so it needs no controller profile. The pose persists for the session.
 */
export function XRPanelAnchor({ children }: { children?: ReactNode }) {
  const ref = useRef<Group>(null);
  const grab = useRef<{ id: string; offset: Matrix4 } | null>(null);
  const held = useRef(new Set<string>());

  useFrame(() => {
    const g = ref.current;
    const { session, inputSourceStates } = xrStore.getState();
    if (!g || !session) return;

    if (grab.current) {
      const s = inputSourceStates.find((x) => x.id === grab.current?.id);
      const pressed = s?.type === 'controller' && s.inputSource.gamepad?.buttons[1]?.pressed && s.object;
      if (!pressed || !s.object || !g.parent) {
        grab.current = null;
        panelPose.position.copy(g.position);
        panelPose.quaternion.copy(g.quaternion);
        return;
      }
      s.object.updateWorldMatrix(true, false);
      g.parent.updateWorldMatrix(true, false);
      m.multiplyMatrices(s.object.matrixWorld, grab.current.offset); // panel in world
      inv.copy(g.parent.matrixWorld).invert();
      m.premultiply(inv); // → rig-local
      m.decompose(g.position, g.quaternion, scaleTmp);
      return;
    }

    for (const s of inputSourceStates) {
      if (s.type !== 'controller' || !s.object) continue;
      const pressed = !!s.inputSource.gamepad?.buttons[1]?.pressed;
      if (!pressed) { held.current.delete(s.id); continue; }
      if (held.current.has(s.id)) continue; // still holding from a miss or a previous drag
      held.current.add(s.id);
      s.object.updateWorldMatrix(true, false);
      s.object.matrixWorld.decompose(ctrlPos, ctrlQ, scaleTmp);
      ray.origin.copy(ctrlPos);
      ray.direction.set(0, 0, -1).applyQuaternion(ctrlQ);
      box.setFromObject(g).expandByScalar(0.08);
      if (!ray.intersectsBox(box) && box.distanceToPoint(ctrlPos) > 0.25) continue;
      g.updateWorldMatrix(true, false);
      const offset = new Matrix4().copy(s.object.matrixWorld).invert().multiply(g.matrixWorld);
      grab.current = { id: s.id, offset };
      break;
    }
  });

  return <group ref={ref} position={panelPose.position} quaternion={panelPose.quaternion}>{children}</group>;
}

export function TeleportFloor({
  size,
  position = [0, 0, 0],
  onTeleport,
  onHover,
  visible = false,
}: {
  size: [number, number];
  position?: [number, number, number];
  onTeleport: (p: [number, number, number]) => void;
  /** where the pointer ray meets the floor (world), null when it leaves — the minimap lights up that room */
  onHover?: (p: [number, number, number] | null) => void;
  visible?: boolean;
}) {
  return (
    <TeleportTarget onTeleport={(p) => onTeleport([p.x, p.y, p.z])}>
      <mesh position={position} rotation-x={-Math.PI / 2} receiveShadow onPointerMove={onHover ? (e) => onHover([e.point.x, e.point.y, e.point.z]) : undefined} onPointerOut={onHover ? () => onHover(null) : undefined}>
        <planeGeometry args={size} />
        <meshStandardMaterial color="#20262e" transparent opacity={visible ? 0.6 : 0} depthWrite={visible} />
      </mesh>
    </TeleportTarget>
  );
}
