/// Owner 2026-10-07: long user texts (posts, comments, bios) keep at most
/// one empty line in a row, so pasted text with dozens of blank lines
/// never turns into an endless gap. Same rule as the API's `tidyText`.
String tidyText(String text) => text
    .replaceAll(RegExp(r'\r\n?'), '\n')
    .replaceAll(RegExp(r'[^\S\n]+\n'), '\n')
    .replaceAll(RegExp(r'\n(?:[^\S\n]*\n){2,}'), '\n\n')
    .trim();
