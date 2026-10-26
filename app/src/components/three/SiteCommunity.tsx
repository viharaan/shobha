'use client';

import { useEffect, useMemo } from 'react';
import { DoubleSide, MeshLambertMaterial, MeshPhongMaterial, type BufferGeometry } from 'three';
import { MASTERPLAN_MEDIAN_TREES, MASTERPLAN_TREES } from '@/data/sobha/masterplanTrees';
import { buildAmenityProps, latticePavilions, treeClearings } from '@/lib/unit/community/amenityProps';
import type { HeightFn } from '@/lib/unit/community/geom';
import { getMassMaterial, getMowTexture } from '@/lib/unit/community/materials';
import { buildSiteGround, buildSiteMassing } from '@/lib/unit/community/siteBuild';
import Trees from '@/lib/unit/community/Trees';
import { SITE_GROUP_TRANSFORM, siteToExplorer } from '@/lib/unit/siteToExplorer';

// traced trees, minus those standing under the amenity props (canopy, courts, stage)
const CLEAR = treeClearings();
const TREES = [...MASTERPLAN_TREES, ...MASTERPLAN_MEDIAN_TREES].filter((t) => !CLEAR.some((c) => Math.hypot(t.x - c.x, t.y - c.y) < c.r));

/**
 * The master-plan landscape inside the site explorer: One Club mass, perimeter wall, roads / paving /
 * plazas / running track / jog loop, the stadium field, water, trees, and the illustrative amenity
 * props (entrance canopy, roundabout, courts, amphitheatre, rink). Everything is built by the unit
 * viewer's community builders (site 3-D frame); the group carries the similarity fit that maps that
 * frame onto the explorer's raster frame (lib/unit/siteToExplorer.ts), so traced features land on the
 * drawn ones. Towers are not drawn here — the explorer stacks its own.
 */
export function SiteCommunity({ hAt, shadows, quality }: { hAt: HeightFn | null; shadows: boolean; quality: 'high' | 'vr' }) {
  // terrain in the site frame (the explorer's hAt is in its own frame)
  const hAtSite = useMemo<HeightFn | undefined>(() => (hAt ? (x, z) => hAt(...siteToExplorer(x, z)) : undefined), [hAt]);
  const geo = useMemo(() => {
    const ground = buildSiteGround(hAtSite);
    const amen = buildAmenityProps(hAtSite);
    return {
      massing: buildSiteMassing({ ownWing: 0, floorY: 0, clip: null, hAt: hAtSite, wings: false }).geometry(),
      paving: ground.paving.geometry(),
      field: ground.field.geometry(),
      water: ground.water.geometry(),
      props: amen.props.geometry(),
      flat: amen.flat.geometry(),
      under: amen.under.geometry(),
    };
  }, [hAtSite]);
  useEffect(() => () => Object.values(geo).forEach((g: BufferGeometry) => g.dispose()), [geo]);
  // flat layers draw over the draped site-plan raster: no depth write, pulled toward the camera
  const mats = useMemo(() => {
    const flat = { depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } as const;
    return {
      paving: new MeshLambertMaterial({ vertexColors: true, ...flat }),
      field: new MeshLambertMaterial({ map: getMowTexture(), ...flat }),
      water: new MeshPhongMaterial({ color: '#3f7896', specular: '#e8f2ff', shininess: 80, ...flat }),
      props: new MeshLambertMaterial({ vertexColors: true, emissive: '#15171b' }),
      wire: new MeshLambertMaterial({ wireframe: true, color: '#9aa0a8' }),
      wireBronze: new MeshLambertMaterial({ wireframe: true, color: '#5a3d2b' }),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const none = () => null;
  const pavilions = useMemo(() => latticePavilions(), []);
  const pavY = (x: number, z: number) => (hAtSite ? hAtSite(x, z) : 0);
  return (
    <group position={SITE_GROUP_TRANSFORM.position} rotation-y={SITE_GROUP_TRANSFORM.rotationY} scale={SITE_GROUP_TRANSFORM.scale} name="site-community">
      <mesh geometry={geo.massing} material={getMassMaterial()} castShadow={shadows} receiveShadow={shadows} raycast={none} />
      <mesh geometry={geo.props} material={mats.props} castShadow={shadows} receiveShadow={shadows} raycast={none} />
      <mesh geometry={geo.under} material={mats.paving} renderOrder={0} receiveShadow={shadows} raycast={none} />
      <mesh geometry={geo.paving} material={mats.paving} renderOrder={1} receiveShadow={shadows} raycast={none} />
      <mesh geometry={geo.field} material={mats.field} renderOrder={2} receiveShadow={shadows} raycast={none} />
      <mesh geometry={geo.water} material={mats.water} renderOrder={3} raycast={none} />
      <mesh geometry={geo.flat} material={mats.paving} renderOrder={4} receiveShadow={shadows} raycast={none} />
      {/* lattice pavilions from the renders: plaza sphere, lagoon cocoons (wire meshes, illustrative) */}
      {pavilions.map((pv, i) => (
        <mesh key={i} position={[pv.at[0], pavY(pv.at[0], pv.at[1]) + (pv.r === pv.ry ? 0.9 + pv.r : pv.ry * 0.95), pv.at[1]]} scale={[1, pv.ry / pv.r, 1]} material={pv.r === pv.ry ? mats.wire : mats.wireBronze} raycast={none}>
          <icosahedronGeometry args={[pv.r, 2]} />
        </mesh>
      ))}
      <Trees trees={TREES} hAtXZ={hAtSite} quality={quality} castShadow={shadows} receiveShadow={shadows} />
    </group>
  );
}
