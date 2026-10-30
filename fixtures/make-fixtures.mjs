// Builds the public test documents in this folder.
// features.docx is written with the docx library; the doc, rtf and odt copies come from LibreOffice (soffice on PATH).
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  HighlightColor,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalMergeType,
  WidthType,
} from 'docx';

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name) => readFileSync(join(here, 'assets', name));

const p = (children, opts = {}) => new Paragraph({ ...opts, children: Array.isArray(children) ? children : [new TextRun(children)] });
const cell = (text, opts = {}) => new TableCell({ ...opts, children: [p(text)] });

const doc = new Document({
  creator: 'docx-reader fixtures',
  title: 'Feature fixture',
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  numbering: {
    config: [
      {
        reference: 'numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2)', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ],
      },
    ],
  },
  footnotes: {
    1: { children: [p('This is footnote one, at the bottom of the page.')] },
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [p('Fixture header text', { alignment: AlignmentType.RIGHT })] }) },
      footers: {
        default: new Footer({ children: [p([new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] })], { alignment: AlignmentType.CENTER })] }),
      },
      children: [
        p('Feature fixture', { heading: HeadingLevel.TITLE }),
        p('Heading one', { heading: HeadingLevel.HEADING_1 }),
        p([
          new TextRun('Plain, '),
          new TextRun({ text: 'bold', bold: true }),
          new TextRun(', '),
          new TextRun({ text: 'italic', italics: true }),
          new TextRun(', '),
          new TextRun({ text: 'underlined', underline: { type: UnderlineType.SINGLE } }),
          new TextRun(', '),
          new TextRun({ text: 'struck', strike: true }),
          new TextRun(', '),
          new TextRun({ text: 'red', color: 'C00000' }),
          new TextRun(', '),
          new TextRun({ text: 'highlighted', highlight: HighlightColor.YELLOW }),
          new TextRun(', E = mc'),
          new TextRun({ text: '2', superScript: true }),
          new TextRun(', H'),
          new TextRun({ text: '2', subScript: true }),
          new TextRun('O.'),
        ]),
        p([
          new TextRun({ text: 'Large 18 pt Georgia. ', font: 'Georgia', size: 36 }),
          new TextRun({ text: 'Small 8 pt Courier New.', font: 'Courier New', size: 16 }),
        ]),
        p([new TextRun('Line one'), new TextRun({ text: 'Line two after a line break', break: 1 })]),
        p([new TextRun('Before tab\tafter tab')]),
        p('Centred paragraph.', { alignment: AlignmentType.CENTER }),
        p('Right-aligned paragraph.', { alignment: AlignmentType.RIGHT }),
        p('Justified paragraph. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.', { alignment: AlignmentType.JUSTIFIED }),
        p([
          new TextRun('A link to '),
          new ExternalHyperlink({ link: 'https://example.com/path?q=1', children: [new TextRun({ text: 'example.com', style: 'Hyperlink' })] }),
          new TextRun(' and a footnote'),
          new FootnoteReferenceRun(1),
          new TextRun('.'),
        ]),
        p('Heading two', { heading: HeadingLevel.HEADING_2 }),
        p('First numbered item', { numbering: { reference: 'numbers', level: 0 } }),
        p('Nested lettered item', { numbering: { reference: 'numbers', level: 1 } }),
        p('Second numbered item', { numbering: { reference: 'numbers', level: 0 } }),
        p('Bullet item', { numbering: { reference: 'bullets', level: 0 } }),
        p('Nested bullet item', { numbering: { reference: 'bullets', level: 1 } }),
        p('Heading three', { heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: [cell('Name'), cell('Role'), cell('City')] }),
            new TableRow({ children: [cell('Asha'), cell('Engineer'), cell('Delhi', { verticalMerge: VerticalMergeType.RESTART })] }),
            new TableRow({ children: [cell('Ravi'), cell('Designer'), cell('', { verticalMerge: VerticalMergeType.CONTINUE })] }),
            new TableRow({ children: [cell('Spans two columns', { columnSpan: 2 }), cell('Pune')] }),
          ],
        }),
        p(''),
        p('हिन्दी पाठ: यह एक परीक्षण अनुच्छेद है। বাংলা: এটি একটি পরীক্ষা।'),
        p([new ImageRun({ type: 'png', data: asset('chart.png'), transformation: { width: 240, height: 120 } })]),
        p([new ImageRun({ type: 'jpg', data: asset('photo.jpg'), transformation: { width: 320, height: 200 } })]),
        p([new PageBreak()]),
        p('Second page', { heading: HeadingLevel.HEADING_1 }),
        p('This paragraph starts the second page.'),
      ],
    },
  ],
});

const docx = join(here, 'features.docx');
writeFileSync(docx, await Packer.toBuffer(doc));
writeFileSync(join(here, 'minimal.docx'), await Packer.toBuffer(new Document({ sections: [{ children: [p('Hello, reader.')] }] })));

for (const name of ['features.docx', 'minimal.docx']) {
  for (const target of ['doc', 'rtf', 'odt']) {
    execFileSync('soffice', ['--headless', '--convert-to', target, '--outdir', here, join(here, name)], { stdio: 'ignore' });
  }
}

// Files whose extension does not match their content, and files that are not documents.
copyFileSync(join(here, 'minimal.rtf'), join(here, 'rtf-named.doc'));
writeFileSync(
  join(here, 'html-named.doc'),
  '<html><head><meta charset="utf-8"><title>Saved as Word</title><script>alert(1)</script></head><body><h1>HTML saved as .doc</h1><p>Some <b>bold</b> text and a remote image <img src="https://example.com/pixel.png"></p></body></html>',
);
writeFileSync(join(here, 'not-a-document.docx'), 'This is plain text with a docx extension.\n');
const full = readFileSync(docx);
writeFileSync(join(here, 'truncated.docx'), full.subarray(0, Math.floor(full.length / 2)));
writeFileSync(join(here, 'empty.docx'), '');
