import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// Owner 2026-09-30 (OQ-037): compact counters everywhere in the app.
void main() {
  setUpAll(() => initializeDateFormatting('en'));

  test('compact counters', () {
    final f = L10nFormats(AppLanguage.fallback);
    expect(SocialFormat.count(f, 0), '0');
    expect(SocialFormat.count(f, 999), '999');
    expect(SocialFormat.count(f, 1000), '1,000');
    expect(SocialFormat.count(f, 1300), '1,300');
    expect(SocialFormat.count(f, 9999), '9,999');
    expect(SocialFormat.count(f, 10000), '10K');
    expect(SocialFormat.count(f, 15200), '15.2K');
    expect(SocialFormat.count(f, 15999), '15.9K');
    expect(SocialFormat.count(f, 99999), '99.9K');
    expect(SocialFormat.count(f, 100000), '100K');
    expect(SocialFormat.count(f, 500400), '500K');
    expect(SocialFormat.count(f, 999999), '999K');
    expect(SocialFormat.count(f, 1000000), '1M');
    expect(SocialFormat.count(f, 1300000), '1.3M');
    expect(SocialFormat.count(f, 12400000), '12M');
    expect(SocialFormat.count(f, 2000000000), '2B');
  });

  test('compact counters are localized (ru, ar)', () async {
    await initializeDateFormatting('ru');
    await initializeDateFormatting('ar');
    final ru = L10nFormats(AppLanguage.ru);
    expect(SocialFormat.count(ru, 15200), startsWith('15,2'));
    expect(SocialFormat.count(ru, 15200), contains('тыс'));
    expect(SocialFormat.count(ru, 1200000), startsWith('1,2'));
    expect(SocialFormat.count(ru, 1200000), contains('млн'));
    final ar = L10nFormats(AppLanguage.fromCode('ar'));
    expect(SocialFormat.count(ar, 15200), contains('ألف'));
  });
}
