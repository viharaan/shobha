import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Panel, StatusBadge } from '@/components/ui/primitives';
import { BROCHURE_PAGES, MEDIA } from '@/data/manifest';

export const metadata: Metadata = { title: 'Media' };

function linkFor(l?: string) {
  if (!l) return null;
  if (l === 'explore') return { href: '/#explore', label: 'Open in 3D' };
  if (l.startsWith('geo:')) return { href: '/#location', label: 'Show on map' };
  if (l.startsWith('amenity:')) return { href: '/#explore', label: 'Locate on site' };
  return null;
}

export default function MediaPage() {
  const videos = MEDIA.filter((m) => m.kind === 'video');
  const images = MEDIA.filter((m) => m.kind === 'image');
  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-8 p-4 md:p-6">
      <header>
        <h1 className="text-2xl tracking-tight">Media & highlights</h1>
        <p className="mt-1 text-sm text-fg-muted">Everything supplied by the developer, organised by what it actually shows. Renders are artist&apos;s impressions; only the drone clip is photographic.</p>
      </header>

      <section>
        <h2 className="label mb-3">Videos</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((v) => {
            const l = linkFor(v.linksTo);
            return (
              <Panel key={v.id}>
                <video controls preload="none" poster={v.poster} className="aspect-video w-full rounded-md bg-black" src={v.src} />
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm">{v.title}</div>
                    {v.description && <p className="mt-0.5 text-xs text-fg-muted">{v.description}</p>}
                  </div>
                  <StatusBadge status={v.provenance.status} />
                </div>
                {l && <Link href={l.href} className="btn mt-2 no-underline">{l.label}</Link>}
              </Panel>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="label mb-3">Plans & creatives</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {images.map((m) => {
            const l = linkFor(m.linksTo);
            return (
              <Panel key={m.id}>
                <a href={m.src} target="_blank" rel="noreferrer"><Image src={m.src} alt={m.title} width={1200} height={800} className="h-auto w-full rounded-md" unoptimized /></a>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm">{m.title}</div>
                    {m.description && <p className="mt-0.5 text-xs text-fg-muted">{m.description}</p>}
                  </div>
                  <StatusBadge status={m.provenance.status} />
                </div>
                {l && <Link href={l.href} className="btn mt-2 no-underline">{l.label}</Link>}
              </Panel>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="label mb-3">Mobile brochure · 30 pages</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
          {BROCHURE_PAGES.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line">
              <Image src={src} alt={`Brochure page ${i + 1}`} width={270} height={480} className="h-auto w-full" unoptimized />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
