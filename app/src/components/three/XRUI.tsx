'use client';

import { Billboard } from '@react-three/drei';
import { signal, type Signal } from '@preact/signals-core';
import { Container, Image, Text } from '@react-three/uikit';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Quaternion, Vector3, type Object3D } from 'three';
import type { Texture } from 'three';
import { navPose, subscribeNavPose } from '@/lib/navPose';
export { useInXR } from '@/lib/xr';

/**
 * 3D UI shown only inside an immersive WebXR session, where DOM (drei Html) is invisible.
 * Built on @react-three/uikit; 1 uikit px = PX metres so panels read at arm's length.
 * The bundled MSDF font has no glyph for "·" or "×": keep XR strings ASCII.
 */
const PX = 0.0025; // labels
const PANEL_PX = 0.0018; // panels: 240 px → 0.43 m
const BG = '#171b21';
const LINE = '#2a3038';
const FG = '#e9e6df';
const MUTED = '#9aa0a8';
const ACCENT = '#c9a96e';

/** Dark rounded panel. Place it where it should float; it is sized by its content. */
export function XRPanel({ children, title, width, overlay, collapsible = false }: { children: ReactNode; title?: string; width?: number; overlay?: boolean; collapsible?: boolean }) {
  // overlay: draw on top regardless of depth. Needed where the canvas uses logarithmicDepthBuffer (site scene):
  // uikit's instanced shaders write linear depth and would otherwise lose the depth test to the ground.
  // collapsible: a Hide button folds the panel to a small Controls pill so it stops blocking the view.
  const [open, setOpen] = useState(true);
  if (collapsible && !open) {
    return (
      <Container pixelSize={PANEL_PX} padding={4} borderRadius={10} backgroundColor={BG} borderWidth={1} borderColor={LINE} depthTest={!overlay} renderOrder={overlay ? 100 : undefined}>
        <XRButton label="Controls" onClick={() => setOpen(true)} />
      </Container>
    );
  }
  return (
    <Container pixelSize={PANEL_PX} width={width} flexDirection="column" gap={6} padding={10} borderRadius={10} backgroundColor={BG} borderWidth={1} borderColor={LINE} depthTest={!overlay} renderOrder={overlay ? 100 : undefined}>
      <Container flexDirection="row" justifyContent="space-between" alignItems="center" gap={8}>
        {title && <Text fontSize={11} color={MUTED}>{title}</Text>}
        {collapsible && <XRButton label="Hide" onClick={() => setOpen(false)} />}
      </Container>
      {children}
    </Container>
  );
}

export function XRButton({ label, active, onClick, grow }: { label: string; active?: boolean; onClick: () => void; grow?: boolean }) {
  return (
    <Container
      flexGrow={grow ? 1 : undefined}
      paddingX={10}
      paddingY={6}
      borderRadius={6}
      borderWidth={1}
      borderColor={active ? ACCENT : LINE}
      backgroundColor={active ? ACCENT : '#20262e'}
      hover={{ backgroundColor: active ? '#dcbf86' : '#3f6f9a', borderColor: '#ffffff', borderWidth: 2 }}
      cursor="pointer"
      onClick={(e) => { e.stopPropagation?.(); onClick(); }}
      justifyContent="center"
    >
      <Text fontSize={13} color={active ? '#000000' : FG}>{label}</Text>
    </Container>
  );
}

/** Floating text label that always faces the viewer (name + optional second line). Root needs an explicit width or uikit collapses it to 0. */
export function XRLabel({ position, text, sub, active }: { position: [number, number, number]; text: string; sub?: string; active?: boolean }) {
  return (
    <Billboard position={position}>
      <Container pixelSize={PX} width={170} flexDirection="column" alignItems="center" paddingX={8} paddingY={4} borderRadius={6} backgroundColor={active ? ACCENT : BG} borderWidth={1} borderColor={active ? ACCENT : LINE}>
        <Text fontSize={13} color={active ? '#000000' : FG}>{text}</Text>
        {sub && <Text fontSize={10} color={active ? '#3a3020' : MUTED}>{sub}</Text>}
      </Container>
    </Billboard>
  );
}

export function XRText({ children, muted }: { children: string; muted?: boolean }) {
  return <Text fontSize={12} color={muted ? MUTED : FG}>{children}</Text>;
}

const PLAYER = '#ff3b30';
// signals are written from a store listener, outside React's render: a plain setter keeps that explicit
const put = <T,>(s: Signal<T>, v: T) => { s.value = v; };

/**
 * Live "you are here": red dot with a dark outline and a heading nose. Driven by the shared navPose
 * store through uikit signals, so position updates (~15 Hz) never re-render React. Off-map positions
 * are clamped to the edge and drawn hollow instead of producing invalid coordinates.
 */
function PlayerMarker({ toUV }: { toUV: (x: number, z: number) => [number, number] }) {
  const sig = useMemo(() => ({ left: signal<`${number}%`>('50%'), top: signal<`${number}%`>('50%'), rot: signal(0), fill: signal(PLAYER), show: signal<'visible' | 'hidden'>('hidden') }), []);
  useEffect(() => {
    const update = () => {
      if (!navPose.valid) { put(sig.show, 'hidden'); return; }
      const [u, v] = toUV(navPose.x, navPose.z);
      const [u2, v2] = toUV(navPose.x + navPose.fx, navPose.z + navPose.fz);
      const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      put(sig.left, `${Math.min(1, Math.max(0, u)) * 100}%` as `${number}%`);
      put(sig.top, `${Math.min(1, Math.max(0, v)) * 100}%` as `${number}%`);
      put(sig.rot, (Math.atan2(u2 - u, -(v2 - v)) * 180) / Math.PI); // map may be rotated (site bearing): heading in uv space
      put(sig.fill, inside ? PLAYER : '#00000000');
      put(sig.show, 'visible');
    };
    update();
    return subscribeNavPose(update);
  }, [toUV, sig]);
  return (
    <Container positionType="absolute" positionLeft={sig.left} positionTop={sig.top} transformTranslateX={-11} transformTranslateY={-11} transformRotateZ={sig.rot} visibility={sig.show} width={22} height={22} alignItems="center" justifyContent="center" pointerEvents="none">
      <Container positionType="absolute" positionTop={-7} width={6} height={12} borderRadius={3} backgroundColor={PLAYER} borderWidth={1} borderColor="#000000" />
      <Container width={14} height={14} borderRadius={7} backgroundColor={sig.fill} borderWidth={3} borderColor={PLAYER} />
    </Container>
  );
}

export interface MapMarker { u: number; v: number; active?: boolean; onClick?: () => void }
/** Clickable area in image fractions (0..1, v down). */
export interface MapRegion { u0: number; v0: number; u1: number; v1: number; active?: boolean; /** the pointer ray is on this room's floor in 3-D */ hovered?: boolean; onClick: () => void }

/**
 * Mini-map for the anchored panel: a top-down image (plan raster or master plan) with tappable regions
 * (rooms) and markers (wings), plus the live red position marker. The image itself takes no clicks, so a
 * tap on empty map space selects nothing. `toUV` maps world x,z (metres) to image fractions.
 */
export function XRMiniMap({ src, aspect, width = 150, toUV, markers = [], regions = [], onPick }: {
  src: string | Texture; aspect: number; width?: number; toUV: (x: number, z: number) => [number, number];
  markers?: MapMarker[]; regions?: MapRegion[];
  /** trigger on an empty part of the map: go there (map u, v in 0..1, v down) */
  onPick?: (u: number, v: number) => void;
}) {
  const height = width / aspect;
  // where the controller ray meets the map: a ring follows it, so the player sees the spot a trigger press would pick
  const surface = useRef<ComponentRef<typeof Container>>(null);
  const [aim, setAim] = useState<[number, number] | null>(null);
  const uvOf = (e: { point: Vector3 }): [number, number] | null => {
    const o = surface.current as Object3D | null; // a uikit Container is a three.js Object3D
    if (!o) return null;
    const p = o.worldToLocal(e.point.clone()); // uikit local space: -0.5..0.5 across the container, y up
    return [Math.min(1, Math.max(0, p.x + 0.5)), Math.min(1, Math.max(0, 0.5 - p.y))];
  };
  const pct = (f: number) => `${Math.min(1, Math.max(0, f)) * 100}%` as const;
  // largest first so smaller rooms (bathrooms, closets) sit on top and stay tappable
  const ordered = [...regions].sort((a, b) => (b.u1 - b.u0) * (b.v1 - b.v0) - (a.u1 - a.u0) * (a.v1 - a.v0));
  return (
    <Container positionType="relative" width={width} height={height} borderRadius={6} borderWidth={1} borderColor={LINE} overflow="hidden">
      {/* eslint-disable-next-line jsx-a11y/alt-text -- uikit Image is a textured quad, not a DOM <img> */}
      <Image src={src} positionType="absolute" positionLeft={0} positionTop={0} width={width} height={height} pointerEvents="none" />
      {/* the aim surface, under the rooms and markers so those keep their own hover and click */}
      <Container
        ref={surface}
        positionType="absolute"
        positionLeft={0}
        positionTop={0}
        width={width}
        height={height}
        backgroundColor="#00000001"
        cursor={onPick ? 'pointer' : undefined}
        onPointerMove={(e) => setAim(uvOf(e))}
        onPointerLeave={() => setAim(null)}
        onClick={onPick ? (e) => { e.stopPropagation?.(); const uv = uvOf(e); if (uv) onPick(uv[0], uv[1]); } : undefined}
      />
      {ordered.map((r, i) => (
        <Container
          key={`r${i}`}
          positionType="absolute"
          positionLeft={pct(r.u0)}
          positionTop={pct(r.v0)}
          width={pct(r.u1 - r.u0)}
          height={pct(r.v1 - r.v0)}
          borderWidth={r.active || r.hovered ? 2 : 1}
          borderColor={r.active ? ACCENT : r.hovered ? '#ffffff' : '#c9a96e88'}
          backgroundColor={r.active ? '#c9a96e55' : r.hovered ? '#3f6f9aaa' : '#00000000'}
          hover={{ backgroundColor: '#3f6f9acc', borderColor: '#ffffff', borderWidth: 2 }}
          cursor="pointer"
          onClick={(e) => { e.stopPropagation?.(); r.onClick(); }}
        />
      ))}
      {markers.map((m, i) => (
        <Container
          key={`m${i}`}
          positionType="absolute"
          positionLeft={pct(m.u)}
          positionTop={pct(m.v)}
          transformTranslateX={-8}
          transformTranslateY={-8}
          width={16}
          height={16}
          borderRadius={8}
          borderWidth={2}
          borderColor="#000000"
          backgroundColor={m.active ? ACCENT : '#e9e6df'}
          hover={m.onClick ? { backgroundColor: ACCENT, transformScale: 1.3 } : undefined}
          cursor={m.onClick ? 'pointer' : undefined}
          onClick={m.onClick ? (e) => { e.stopPropagation?.(); m.onClick?.(); } : undefined}
        />
      ))}
      {aim && (
        <Container positionType="absolute" positionLeft={pct(aim[0])} positionTop={pct(aim[1])} transformTranslateX={-11} transformTranslateY={-11} width={22} height={22} borderRadius={11} borderWidth={2} borderColor="#ffffff" backgroundColor="#3f6f9a99" pointerEvents="none" />
      )}
      <PlayerMarker toUV={toUV} />
    </Container>
  );
}

const hudPos = new Vector3();
const hudQ = new Quaternion();
const hudOff = new Vector3();

/**
 * Head-locked HUD at the bottom of the view: a small "Show map" pill wherever the player looks, which
 * expands into the minimap (children) and collapses again on tap. World-space group eased toward a
 * point 1 m ahead and 0.4 m below the eyes each frame; drawn without depth test so walls never hide it.
 */
export function XRMapHud({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    camera.getWorldPosition(hudPos);
    camera.getWorldQuaternion(hudQ);
    hudOff.set(0, open ? -0.42 : -0.46, -1.0).applyQuaternion(hudQ);
    hudPos.add(hudOff);
    g.position.lerp(hudPos, 0.18);
    g.quaternion.slerp(hudQ, 0.18);
  });
  return (
    <group ref={ref} renderOrder={200}>
      <Container pixelSize={PANEL_PX} flexDirection="column" alignItems="center" gap={6} padding={6} borderRadius={10} backgroundColor={BG} borderWidth={1} borderColor={LINE} depthTest={false} renderOrder={200}>
        {open && children}
        <XRButton label={open ? 'Hide map' : 'Show map'} active={open} onClick={() => setOpen(!open)} />
      </Container>
    </group>
  );
}
