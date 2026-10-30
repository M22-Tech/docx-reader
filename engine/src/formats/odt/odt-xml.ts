/** The ODF namespaces; elements and attributes are matched by these and the local name, never by prefix. */
export const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
  dc: 'http://purl.org/dc/elements/1.1/',
} as const;

export function isElement(node: Node | null | undefined, ns: string, localName?: string): node is Element {
  return (
    node?.nodeType === 1 &&
    (node as Element).namespaceURI === ns &&
    (localName === undefined || (node as Element).localName === localName)
  );
}

/** The child elements, in order. */
export function childElements(parent: Element): Element[] {
  const result: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) result.push(node as Element);
  }
  return result;
}

/** The first child element with this namespace and local name. */
export function firstChild(parent: Element, ns: string, localName: string): Element | undefined {
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (isElement(node, ns, localName)) return node;
  }
  return undefined;
}

/** All descendant elements with this namespace and local name, in document order. */
export function descendants(root: Element, ns: string, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(ns, localName));
}

/** An attribute value, or undefined when absent. */
export function attr(element: Element, ns: string, localName: string): string | undefined {
  return element.getAttributeNS(ns, localName) ?? undefined;
}

/** An integer attribute of at least `min`, or `fallback`. */
export function intAttr(element: Element, ns: string, localName: string, fallback: number, min = 1): number {
  const value = attr(element, ns, localName);
  if (value === undefined || !/^\s*\d+\s*$/.test(value)) return fallback;
  return Math.max(Number(value), min);
}

/** Rounds away the noise that unit conversion leaves (18pt through millimetres is 18.000000000000004). */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
