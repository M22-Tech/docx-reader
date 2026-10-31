import { mapIncomingPath } from '../modules/document/incoming-path';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return mapIncomingPath(path);
}
