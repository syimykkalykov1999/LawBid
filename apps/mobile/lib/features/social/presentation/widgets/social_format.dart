// ignore_for_file: lines_longer_than_80_chars
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Relative time for posts, comments, chats and notifications: "12m",
/// "15h", "3d" (no "ago"), the date after ten days. One helper for all.
abstract final class SocialFormat {
  static String ago(Translator t, L10nFormats f, DateTime at,
          {DateTime? now}) =>
      shortDate(t, f, at, now: now);

  /// Owner 2026-10-12: the slim date by Save — "now", "5m", "3h", "2d" for
  /// the first week, then "Mar 14", and with the year for another year.
  static String shortDate(
    Translator t,
    L10nFormats f,
    DateTime at, {
    DateTime? now,
  }) {
    final n = now ?? DateTime.now();
    final diff = n.difference(at);
    if (diff.inMinutes < 1) {
      return t.t('time.short.s',
          {'count': '${diff.inSeconds < 1 ? 1 : diff.inSeconds}'});
    }
    if (diff.inHours < 1) {
      return t.t('time.short.m', {'count': '${diff.inMinutes}'});
    }
    if (diff.inDays < 1) {
      return t.t('time.short.h', {'count': '${diff.inHours}'});
    }
    // Owner 2026-10-13: "5m", "15h", "3d" — no "ago" — up to 10 days, then
    // the date ("Oct 12", with the year for another year).
    if (diff.inDays < 7) {
      return t.t('time.short.d', {'count': '${diff.inDays}'});
    }
    if (diff.inDays <= 10) {
      return t.t('time.short.w', {'count': '${diff.inDays ~/ 7}'});
    }
    return at.year == n.year ? f.dayMonth(at) : f.date(at);
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
