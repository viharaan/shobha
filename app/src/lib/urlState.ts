/**
 * The whole experience lives on `/`; selection state lives in its query string so every view is shareable.
 *
 *   mode=home | map      stage shows the unit viewer or the location map (absent = community)
 *   find=1               the home finder runs in the stage (Community mode)
 *   wing, flat, floor    a home (numbers)
 *   plan=type-a          unit type when no flat is chosen
 *   beds, finish, facing finder filters; legacy `config` still narrows
 *   view=2d|3d           home-mode layout (absent = split)
 *   tour=1 | rooms       guided tour running; `rooms` starts at the first room stop
 *   present=1            presentation mode
 *   mode=media           the developer's videos, plans and brochure in the stage
 *   #explore             the stage (everything lives in it)
 *
 * Pure helpers here (safe in server components); the hook is in useUrlState.ts.
 */
export type Patch = Record<string, string | number | null | undefined>;

export function buildQuery(base: URLSearchParams | null, patch: Patch): string {
  const next = new URLSearchParams(base?.toString() ?? '');
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') next.delete(k);
    else next.set(k, String(v));
  }
  const s = next.toString();
  return s ? `?${s}` : '';
}

/** Link to the single page with a fresh query (nothing inherited) and a section anchor. */
export function pageHref(patch: Patch, hash = 'explore'): string {
  return `/${buildQuery(null, patch)}#${hash}`;
}
