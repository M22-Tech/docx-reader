import type { PageSetup } from '../../model/document-model';
import { parseLength } from '../shared/units';
import type { OdtStyles } from './odt-styles';
import { attr, childElements, descendants, firstChild, NS, round } from './odt-xml';

const A4: PageSetup = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 25.4,
  marginRightMm: 25.4,
  marginBottomMm: 25.4,
  marginLeftMm: 25.4,
};

/** The name of the master page the first paragraph (in document order) switches to, if any. */
function firstMasterPageName(body: Element, styles: OdtStyles): string | undefined {
  for (const element of body.getElementsByTagNameNS(NS.text, '*')) {
    if (element.localName !== 'p' && element.localName !== 'h') continue;
    const name = styles.paragraph(attr(element, NS.text, 'style-name')).masterPageName;
    if (name !== undefined) return name;
  }
  return undefined;
}

function findByName(elements: Element[], name: string | undefined): Element | undefined {
  return name === undefined ? undefined : elements.find((element) => attr(element, NS.style, 'name') === name);
}

/** The page setup from the master page in use and its page layout; A4 with 2.54 cm margins for what is missing. */
export function readPage(
  content: Document,
  styles: Document | undefined,
  odtStyles: OdtStyles,
  body: Element,
): PageSetup {
  const masters = styles ? descendants(styles.documentElement, NS.style, 'master-page') : [];
  const master =
    findByName(masters, firstMasterPageName(body, odtStyles)) ?? findByName(masters, 'Standard') ?? masters[0];
  if (!master) return A4;

  const layouts = [styles, content].flatMap((doc) => {
    const automatic = doc ? firstChild(doc.documentElement, NS.office, 'automatic-styles') : undefined;
    return automatic ? childElements(automatic).filter((element) => element.localName === 'page-layout') : [];
  });
  const layout = findByName(layouts, attr(master, NS.style, 'page-layout-name'));
  const props = layout ? firstChild(layout, NS.style, 'page-layout-properties') : undefined;
  if (!props) return A4;

  const read = (name: string, fallback: number): number => {
    const length = parseLength(attr(props, NS.fo, name));
    return length && length.mm > 0 ? round(length.mm, 3) : fallback;
  };
  const margin = (name: string, fallback: number): number => {
    const length = parseLength(attr(props, NS.fo, name));
    return length && length.mm >= 0 ? round(length.mm, 3) : fallback;
  };
  return {
    widthMm: read('page-width', A4.widthMm),
    heightMm: read('page-height', A4.heightMm),
    marginTopMm: margin('margin-top', A4.marginTopMm),
    marginRightMm: margin('margin-right', A4.marginRightMm),
    marginBottomMm: margin('margin-bottom', A4.marginBottomMm),
    marginLeftMm: margin('margin-left', A4.marginLeftMm),
  };
}
