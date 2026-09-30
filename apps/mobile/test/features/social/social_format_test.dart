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
    expect(SocialFormat.count(f, 1000), '1K');
    expect(SocialFormat.count(f, 1300), '1.3K');
    expect(SocialFormat.count(f, 12450), '12K');
    expect(SocialFormat.count(f, 500000), '500K');
    expect(SocialFormat.count(f, 999999), '999K');
    expect(SocialFormat.count(f, 1000000), '1M');
    expect(SocialFormat.count(f, 1300000), '1.3M');
    expect(SocialFormat.count(f, 3000000), '3M');
    expect(SocialFormat.count(f, 2000000000), '2B');
  });
}
