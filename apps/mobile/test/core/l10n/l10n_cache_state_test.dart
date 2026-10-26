import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// S16-2: the same bundle assigned again is the same state, so the ~100
/// widgets reading the translator are not rebuilt for nothing.
void main() {
  test('equal bundles are equal states, a changed text is not', () {
    const a = L10nCacheState(lang: 'en', entries: {'k': 'v'});
    const b = L10nCacheState(lang: 'en', entries: {'k': 'v'});
    expect(a, b);
    expect(a.hashCode, b.hashCode);
    expect(a.copyWith(entries: {'k': 'w'}), isNot(a));
    expect(a.copyWith(lang: 'de'), isNot(a));
  });
}
