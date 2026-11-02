import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/shared/text/word_match.dart';

void main() {
  test('case, accents and ё are ignored', () {
    expect(matchesWords('JOSE', ['José García']), isTrue);
    expect(matchesWords('garcia', ['José García']), isTrue);
    expect(matchesWords('федор', ['Фёдор Иванов']), isTrue);
  });
  test('every word starts a word, in any order', () {
    expect(matchesWords('пет ив', ['Иван Петров']), isTrue);
    expect(matchesWords('ван', ['Иван Петров']), isFalse);
    expect(matchesWords('ivan x', ['Ivan Petrov']), isFalse);
  });
  test('username and @ are handled; several fields', () {
    expect(matchesWords('@petr', ['Иван', 'petr_77']), isTrue);
    expect(matchesWords('иван petr', ['Иван', null, 'petr_77']), isTrue);
  });
  test('blank matches all; CJK matches inside', () {
    expect(matchesWords('  ', ['x']), isTrue);
    expect(matchesWords('法律', ['家庭法律师']), isTrue);
    expect(matchesWords('zz', ['']), isFalse);
  });
}
