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
  static String count(L10nFormats f, int n) {
    if (n < 10000) return f.number(n);
    if (n < 1000000)
      return '${(n / 1000).toStringAsFixed(n < 100000 ? 1 : 0)}K';
    return '${(n / 1000000).toStringAsFixed(1)}M';
  }

  static String postLink(String host, String postId) =>
      'https://$host/post/${Uri.encodeComponent(postId)}';
}
