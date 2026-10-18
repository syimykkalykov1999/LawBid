import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/search/application/search_providers.dart';

/// Audit 2026-10-18: what people type into the Search tabs and "My cases".
void main() {
  group('isSearchable', () {
    test('a bare @ or # does not count, the server would say "too short"', () {
      expect(isSearchable('@'), isFalse);
      expect(isSearchable('@a'), isFalse);
      expect(isSearchable('#a'), isFalse);
      expect(isSearchable('  ab  '), isTrue);
      expect(isSearchable('@ab'), isTrue);
      expect(isSearchable('#familylaw'), isTrue);
    });

    test('the Topics tab accepts a one-letter tag prefix after #', () {
      expect(isSearchable('#a', tagPrefix: true), isTrue);
      expect(isSearchable('#', tagPrefix: true), isFalse);
      expect(isSearchable('a', tagPrefix: true), isFalse);
    });
  });

  group('matchingPracticeCategories (Topics tab)', () {
    const codes = ['family_law', 'immigration'];
    List<String> run(String q, {Set<String> remote = const {}}) =>
        matchingPracticeCategories(
          codes: codes,
          query: q,
          localName: (c) => c == 'family_law' ? 'Семейное право' : 'Иммиграция',
          englishName: (c) => c == 'family_law' ? 'Family Law' : 'Immigration',
          tag: (c) => c.replaceAll('_', ''),
          remoteCategories: remote,
        );

    test('app language, English name and tag, any case, with or without #', () {
      expect(run('семей'), ['family_law']);
      expect(run('FAMILY law'), ['family_law']);
      expect(run('#familylaw'), ['family_law']);
      expect(run('immi'), ['immigration']);
    });

    test('a name in another language or a subtopic comes from the server', () {
      expect(run('divorce'), isEmpty);
      expect(run('divorce', remote: {'family_law'}), ['family_law']);
    });

    test('empty query lists nothing', () {
      expect(run('#'), isEmpty);
    });
  });

  group('myCaseMatches ("My cases" search)', () {
    const names = ['Развод', 'Divorce', 'Семейное право', 'Family Law'];
    test('title, topic in both languages, every word, any case', () {
      expect(myCaseMatches('Uncontested house sale', names, 'HOUSE'), isTrue);
      expect(myCaseMatches('Spouse left', names, 'развод'), isTrue);
      expect(myCaseMatches('Spouse left', names, 'family law'), isTrue);
      expect(myCaseMatches('Spouse left', names, 'spouse divorce'), isTrue);
      expect(myCaseMatches('Spouse left', names, 'spouse dui'), isFalse);
      expect(myCaseMatches('Spouse left', names, ''), isTrue);
    });
  });
}
