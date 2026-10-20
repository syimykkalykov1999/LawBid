import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/text/search_fold.dart';

void main() {
  test('the skeleton is the same in both alphabets (server vectors)', () {
    const pairs = {
      'Emily': 'emili',
      'Эмили': 'emili',
      'John': 'ion',
      'Джон': 'ion',
      'Richard': 'riчard',
      'Ричард': 'riчard',
      'Sasha': 'saшa',
      'Саша': 'saшa',
      'Mikhail': 'miail',
      'Михаил': 'miail',
      'Harris': 'aris',
      'Харрис': 'aris',
      'Maria': 'maria',
      'Мария': 'maria',
      'Yulia': 'iulia',
      'Юлия': 'iulia',
      'Zhanna': 'жana',
      'Жанна': 'жana',
      'Alёna': 'alena',
    };
    pairs.forEach(
        (name, skel) => expect(nameSkeleton(name), skel, reason: name),);
  });

  test('a query matches across alphabets, order, accents and one typo', () {
    expect(textMatches('Эмили', ['Emily Brown']), isTrue);
    expect(textMatches('браун эмили', ['Emily Brown']), isTrue);
    expect(textMatches('Рэйчел', ['Rachel Goldstein']), isTrue);
    expect(textMatches('Шарлотта', ['Charlotte Davis']), isTrue);
    expect(textMatches('jose', ['José Martínez']), isTrue);
    expect(textMatches('Алена', ['Алёна']), isTrue);
    expect(textMatches('Golstein', ['Rachel Goldstein']), isTrue);
    expect(textMatches('@emily', ['Emily Brown']), isTrue);
    expect(textMatches('Эмили Дэвис', ['Emily Brown']), isFalse);
    expect(textMatches('', ['anything']), isTrue);
    expect(textMatches('x', const <String?>[null]), isFalse);
  });
}
