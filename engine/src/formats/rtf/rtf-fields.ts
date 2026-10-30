/**
 * The target of a `HYPERLINK` field instruction: `HYPERLINK "url"`, `HYPERLINK "url" \l "bookmark"` (the bookmark
 * after a `#`) and `HYPERLINK \l "bookmark"` (`#bookmark`). Undefined for other instructions or an empty target.
 */
export function hyperlinkOf(instruction: string): string | undefined {
  if (!/^\s*HYPERLINK\b/i.test(instruction)) return undefined;
  const tokens = [...instruction.replace(/^\s*HYPERLINK\b/i, '').matchAll(/"([^"]*)"|\\([A-Za-z])|(\S+)/g)];
  let url: string | undefined;
  let bookmark: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as RegExpMatchArray;
    const letter = token[2]?.toLowerCase();
    if (letter === undefined) {
      url ??= token[1] ?? token[3];
      continue;
    }
    // `\l`, `\o` and `\t` take an argument; `\n` and `\m` don't.
    if (letter === 'l' || letter === 'o' || letter === 't') {
      const argument = tokens[i + 1];
      if (argument && argument[2] === undefined) {
        i++;
        if (letter === 'l') bookmark = argument[1] ?? argument[3];
      }
    }
  }
  if (url && bookmark) return `${url}#${bookmark}`;
  if (url) return url;
  return bookmark ? `#${bookmark}` : undefined;
}
