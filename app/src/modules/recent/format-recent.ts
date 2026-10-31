import { MAX_SHOWN_NAME_LENGTH } from '../../config/constants';
import { extensionOf } from '../document/document';
import type { RecentEntry } from './recent';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_TAIL = 8;

/** Cuts a long name in the middle with "…", keeping the end (the extension) visible. */
export function cutName(name: string, maxLength: number = MAX_SHOWN_NAME_LENGTH): string {
  if (name.length <= maxLength) return name;
  const extensionLength = name.length - name.lastIndexOf('.');
  const hasExtension = name.lastIndexOf('.') > 0 && extensionLength <= 11;
  const tail = Math.max(MIN_TAIL, hasExtension ? extensionLength + 3 : MIN_TAIL);
  const head = Math.max(1, maxLength - tail - 1);
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

/** "840 KB", "1.2 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = Math.round(bytes / 1024);
  if (kilobytes < 1024) return `${kilobytes} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "Today, 14:05", "Yesterday, 09:30", "12 Oct", and the year ("12 Oct 2024") when it isn't this year. Local time. */
export function formatOpened(openedAt: number, now: number): string {
  const opened = new Date(openedAt);
  const current = new Date(now);
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(current) - startOfDay(opened)) / 86_400_000);
  const time = `${pad(opened.getHours())}:${pad(opened.getMinutes())}`;
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  const day = `${opened.getDate()} ${MONTHS[opened.getMonth()]}`;
  return opened.getFullYear() === current.getFullYear() ? day : `${day} ${opened.getFullYear()}`;
}

/** The format when the viewer has named it, else the extension of the file name, in capitals. */
export function formatLabel(entry: Pick<RecentEntry, 'format' | 'name'>): string {
  return (entry.format ?? extensionOf(entry.name)).toUpperCase();
}
