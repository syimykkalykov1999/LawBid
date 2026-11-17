import 'package:flutter/widgets.dart';
import 'package:lawbid/core/config/client_tuning.dart';

/// Owner row 38 (Instagram / TikTok): one rule for every infinite list —
/// the next page is asked for while about a screen of the list is still
/// ahead, not at the last row, and pictures of the next few rows are
/// downloaded before they scroll in.
///
/// The same idea as the "prefetch distance" of Android's Paging 3
/// (`PagingConfig.prefetchDistance`, Apache-2.0) and the
/// `invisibleItemsThreshold` of infinite_scroll_pagination (MIT): a distance
/// from the end, not the end itself. The distances come from the admin
/// (`client.load_ahead_percent`, `client.feed_load_ahead_percent`,
/// `client.load_ahead_rows`, `client.media_prefetch_ahead`), never from code.
abstract final class LoadAhead {
  /// How far before the end a list of rows asks for its next page.
  static double extent(ScrollMetrics m, {bool cards = false}) =>
      m.viewportDimension *
      (cards
          ? ClientTuning.feedLoadAheadScreens
          : ClientTuning.loadAheadScreens);

  /// True while the list is within [extent] of its end.
  static bool nearEnd(ScrollMetrics m, {bool cards = false}) =>
      m.extentAfter <= extent(m, cards: cards);

  /// Message threads: how many rows before the oldest loaded one.
  static int get rows => ClientTuning.loadAheadRows;

  /// How many next rows get their pictures warmed.
  static int get media => ClientTuning.mediaPrefetchAhead;
}

/// Row 38: asks once per page. A fast scroll sends many scroll events before
/// the list rebuilds with the next page; [ask] lets the first one through
/// and drops the rest until the list has grown (or [reset] after a retry),
/// so the same cursor is never asked for twice.
class LoadAheadGate {
  int? _askedAt;

  /// Calls [load] unless it was already called for a list of [length] rows.
  void ask(int length, VoidCallback load) {
    if (_askedAt == length) return;
    _askedAt = length;
    load();
  }

  void reset() => _askedAt = null;
}
