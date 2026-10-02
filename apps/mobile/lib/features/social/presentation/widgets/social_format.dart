// ignore_for_file: lines_longer_than_80_chars
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Relative time for posts, comments and notifications ("2 ч назад"):
/// minutes and hours for today, days for a week, then the date.
abstract final class SocialFormat {
  static String ago(Translator t, L10nFormats f, DateTime at, {DateTime? now}) {
    final diff = (now ?? DateTime.now()).difference(at);
    if (diff.inMinutes < 1) return t.t('time.justNow');
    if (diff.inHours < 1) {
      return t.plural('time.minutesAgo', diff.inMinutes);
    }
    if (diff.inDays < 1) return t.plural('time.hoursAgo', diff.inHours);
    if (diff.inDays < 7) return t.plural('time.daysAgo', diff.inDays);
    return f.date(at);
  }

  /// 1 234 / 12.5K / 3.4M — compact counters under posts.
  /// Owner 2026-09-30 (OQ-037): compact counters everywhere — 999,
  /// 1.3K, 12K, 500K, 1.3M, 2B (one decimal only below 10 of the unit,
  /// never a trailing ".0").
  static String count(L10nFormats f, int n) {
    if (n < 1000) return f.number(n);
    String unit(double v, String s) {
      final text = v < 10 ? v.toStringAsFixed(1) : v.floor().toString();
      return '${text.endsWith('.0') ? text.substring(0, text.length - 2) : text}$s';
    }

    // Round down, so 999 999 never shows as "1000K".
    double floor1(double v) => (v * 10).floorToDouble() / 10;
    if (n < 1000000) return unit(floor1(n / 1000), 'K');
    if (n < 1000000000) return unit(floor1(n / 1000000), 'M');
    return unit(floor1(n / 1000000000), 'B');
  }

  /// A plural label ("12 345 likes") with its number made compact
  /// ("12K likes") — OQ-037.
  static String plural(Translator t, L10nFormats f, String key, int n) {
    final text = t.plural(key, n);
    final compact = count(f, n);
    for (final raw in [f.number(n), '$n']) {
      if (text.contains(raw)) return text.replaceFirst(raw, compact);
    }
    return text;
  }

  static String postLink(String host, String postId) =>
      'https://$host/post/${Uri.encodeComponent(postId)}';
}
