import { APP_NAME } from '../config/constants';
import generated from './generated/licences.json';

export interface LicenceEntry {
  name: string;
  version: string;
  /** The licence's name or SPDX expression, from the package. */
  license: string;
  /** The full text; null when the package ships none. */
  text: string | null;
}

/** The id used in the route to a licence's text. */
export function licenceId(entry: Pick<LicenceEntry, 'name' | 'version'>): string {
  return `${entry.name}@${entry.version}`;
}

/** DocX Reader first, then the rest sorted by name (and version). */
export function orderLicences(entries: readonly LicenceEntry[]): LicenceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.name === APP_NAME && b.name !== APP_NAME) return -1;
    if (b.name === APP_NAME && a.name !== APP_NAME) return 1;
    return a.name.localeCompare(b.name) || a.version.localeCompare(b.version);
  });
}

export const licences: LicenceEntry[] = orderLicences(generated);

export function findLicence(id: string): LicenceEntry | undefined {
  return licences.find((entry) => licenceId(entry) === id);
}
