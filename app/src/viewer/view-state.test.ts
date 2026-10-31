import { freshViewState, textReflows, toggleIcon, type ViewState } from './view-state';

const shown = (shownMode: ViewState['shownMode'], format: string): ViewState => ({
  ...freshViewState('a'),
  shownMode,
  format,
});

describe('textReflows', () => {
  it('is true in Rendered for every format', () => {
    expect(textReflows(shown('rendered', 'docx'))).toBe(true);
    expect(textReflows(shown('rendered', 'html'))).toBe(true);
  });

  it('is true in Raw for a source file only', () => {
    expect(textReflows(shown('raw', 'html'))).toBe(true);
    expect(textReflows(shown('raw', 'docx'))).toBe(false);
    expect(textReflows(shown('raw', 'rtf'))).toBe(false);
  });

  it('is false before the first render', () => {
    expect(textReflows(freshViewState('a'))).toBe(false);
  });
});

describe('toggleIcon', () => {
  it('shows BookOpen when switching to Rendered', () => {
    expect(toggleIcon(shown('raw', 'docx'))).toBe('book-open');
    expect(toggleIcon(shown('raw', 'html'))).toBe('book-open');
  });

  it('shows FileText for documents and Code for source files when switching to Raw', () => {
    expect(toggleIcon(shown('rendered', 'docx'))).toBe('file-text');
    expect(toggleIcon(shown('rendered', 'html'))).toBe('code');
  });
});
