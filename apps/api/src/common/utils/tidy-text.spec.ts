import { tidyText } from './tidy-text';

describe('tidyText', () => {
  it('keeps at most one empty line in a row', () => {
    expect(tidyText('a\n\n\n\n\n\nb')).toBe('a\n\nb');
    expect(tidyText('a\r\n\r\n\r\n  \n\t\nb')).toBe('a\n\nb');
  });

  it('keeps single line breaks and one blank line as they are', () => {
    expect(tidyText('a\nb\n\nc')).toBe('a\nb\n\nc');
  });

  it('trims trailing spaces and the ends', () => {
    expect(tidyText('  a   \nb \n\n\n')).toBe('a\nb');
  });
});
