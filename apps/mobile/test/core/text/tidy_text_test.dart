import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/text/tidy_text.dart';

void main() {
  test('keeps at most one empty line in a row', () {
    expect(tidyText('a\n\n\n\n\n\nb'), 'a\n\nb');
    expect(tidyText('a\r\n\r\n\r\n  \n\t\nb'), 'a\n\nb');
  });

  test('keeps single breaks and one blank line', () {
    expect(tidyText('a\nb\n\nc'), 'a\nb\n\nc');
  });

  test('trims trailing spaces and the ends', () {
    expect(tidyText('  a   \nb \n\n\n'), 'a\nb');
  });
}
