const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** The address to hand to the browser, or null when the scheme isn't http, https or mailto (docs/spec/03-viewer.md, Links). */
export function openableLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  return OPENABLE_PROTOCOLS.has(url.protocol) ? href : null;
}
