/** Turns the path of an incoming Android intent into a route: a `content://` or `file://` document goes to the viewer, anything else is left alone. */
export function mapIncomingPath(path: string): string {
  if (path.startsWith('content://') || path.startsWith('file://')) {
    return `/viewer?source=${encodeURIComponent(path)}`;
  }
  return path;
}
