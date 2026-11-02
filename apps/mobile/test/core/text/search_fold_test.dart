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
      (name, skel) => expect(nameSkeleton(name), skel, reason: name),
    );
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

  group('nameTier / rankByName (owner 2026-10-28, same tiers as the server)',
      () {
    test('tiers: exact, prefix, word start, inside, other alphabet, typo', () {
      expect(nameTier('syimyk kalykov', 'Syimyk Kalykov'), 0);
      expect(nameTier('kal', 'Syimyk Kalykov'), 1);
      expect(nameTier('syi', 'Syimyk Kalykov'), 1);
      expect(nameTier('kalykov syimyk', 'Syimyk Kalykov'), 2);
      expect(nameTier('kal', 'Ekaterina Shkalova'), 3);
      expect(nameTier('калык', 'Syimyk Kalykov'), 4);
      expect(nameTier('kalykob', 'Syimyk Kalykov'), 5);
    });

    test('short text never matches loosely: «jah» is not Kalykov', () {
      expect(nameTier('jah', 'Syimyk Kalykov'), isNull);
      expect(nameTier('jah', 'Jahongir Karimov'), 1);
      expect(nameTier('ka', 'Ekaterina Shkalova'), isNull);
      expect(nameTier('klk', 'Syimyk Kalykov'), isNull);
    });

    test('every typed word by its start: «sima kalykov» is not Syimyk', () {
      expect(nameTier('sima kalykov', 'Sima Kalykov'), 0);
      expect(nameTier('sima kalykov', 'Syimyk Kalykov'), isNull);
    });

    test('best first; typo matches only when nothing matched better', () {
      final names = ['Syimyk Kalykov', 'Ekaterina Shkalova', 'Kalinda Moore'];
      expect(rankByName(names, 'kal', (n) => n), [
        'Syimyk Kalykov',
        'Kalinda Moore',
        'Ekaterina Shkalova',
      ]);
      expect(rankByName(names, 'kalykob', (n) => n), ['Syimyk Kalykov']);
      expect(rankByName(names, '', (n) => n), names);
    });
  });
}
