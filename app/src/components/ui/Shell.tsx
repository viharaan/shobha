/**
 * The page frame. There is no header any more: the stage fills the screen and is the one place to navigate (modes,
 * dock, find a home, location, media). Kept as a component so the layout stays the single place to add page chrome.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-col">{children}</main>;
}
