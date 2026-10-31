import { APP_NAME } from '../config/constants';
import { findLicence, licenceId, licences, orderLicences, type LicenceEntry } from './licences';

function entry(name: string, version = '1.0.0'): LicenceEntry {
  return { name, version, license: 'MIT', text: null };
}

describe('orderLicences', () => {
  it('puts the app first and sorts the rest by name', () => {
    const ordered = orderLicences([entry('zod'), entry('Arimo'), entry(APP_NAME), entry('jszip')]);
    expect(ordered.map((item) => item.name)).toEqual([APP_NAME, 'Arimo', 'jszip', 'zod']);
  });

  it('sorts the same name by version and does not change its input', () => {
    const input = [entry('a', '2.0.0'), entry('a', '1.0.0')];
    expect(orderLicences(input).map((item) => item.version)).toEqual(['1.0.0', '2.0.0']);
    expect(input[0]?.version).toBe('2.0.0');
  });
});

describe('licences', () => {
  it('lists the app first', () => {
    expect(licences[0]?.name).toBe(APP_NAME);
  });

  it('finds an entry by the id used in the route', () => {
    const first = licences[0];
    expect(first && findLicence(licenceId(first))).toBe(first);
    expect(findLicence('nope@0')).toBeUndefined();
  });
});
