import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/core/media/video_prefetch.dart';

/// What a visible Search-grid tile tells the coordinator.
@immutable
class GridTileState {
  const GridTileState({
    required this.index,
    required this.fraction,
    required this.visible,
    this.url,
    this.ahead = const [],
  });

  /// Position in the grid (nearest to the top is warmed first).
  final int index;

  /// 0..1 of the tile on screen.
  final double fraction;

  /// Its tab / route is on screen and the app is in the foreground.
  final bool visible;

  /// Its HLS playlist when it is a playable video.
  final String? url;

  /// Playlists of the next videos below it (one screen ahead).
  final List<String> ahead;
}

/// Owner 2026-10-23 (Instagram's Explore): decides, for the Search grid,
/// which video tiles
///  * get their first bytes fetched ([HlsPrefetcher]: master + lowest
///    rendition + first segment) — the visible ones and the next few;
///  * play a muted preview — at most [maxPreviews] (a player holds a
///    hardware decoder), the most visible ones first.
/// Nothing is fetched or played on data saver.
class GridVideoCoordinator extends ChangeNotifier {
  GridVideoCoordinator({
    HlsPrefetcher? prefetcher,
    this.maxPreviews = 2,
    this.web = false,
  }) : _prefetcher = prefetcher ?? HlsPrefetcher.instance;

  final HlsPrefetcher _prefetcher;
  final int maxPreviews;

  /// A browser plays an MP4, not the HLS playlist: no HLS prefetch.
  final bool web;

  /// A tile counts as "the one on screen" from this fraction.
  static const minPreviewFraction = 0.6;
  static const _takeOver = 0.2;

  final _tiles = <String, GridTileState>{};
  var _selected = <String>[];
  var _wanted = <String>[];
  bool _dataSaver = false;
  bool _disposed = false;

  bool isPreviewing(String id) => _selected.contains(id);

  @visibleForTesting
  List<String> get previewing => List.unmodifiable(_selected);

  @visibleForTesting
  List<String> get wanted => List.unmodifiable(_wanted);

  void setDataSaver({required bool on}) {
    if (on == _dataSaver) return;
    _dataSaver = on;
    _recompute();
  }

  void report(String id, GridTileState state) {
    _tiles[id] = state;
    _recompute();
  }

  void remove(String id) {
    if (_tiles.remove(id) != null) _recompute();
  }

  bool _fit(GridTileState t) =>
      !_dataSaver &&
      t.visible &&
      t.url != null &&
      t.fraction >= minPreviewFraction;

  void _recompute() {
    // Previews: keep the current ones while they still fit (no flapping),
    // fill the free places with the most visible tiles.
    final next = <String>[
      for (final id in _selected)
        if (_tiles[id] case final t? when _fit(t)) id,
    ];
    final rest = _tiles.entries
        .where((e) => _fit(e.value) && !next.contains(e.key))
        .toList()
      ..sort((a, b) {
        final byFraction = b.value.fraction.compareTo(a.value.fraction);
        return byFraction != 0
            ? byFraction
            : a.value.index.compareTo(b.value.index);
      });
    for (final e in rest) {
      if (next.length < maxPreviews) {
        next.add(e.key);
        continue;
      }
      // A running preview is only given up for a clearly more visible tile.
      var weakest = next.first;
      for (final id in next) {
        if (_tiles[id]!.fraction < _tiles[weakest]!.fraction) weakest = id;
      }
      if (e.value.fraction - _tiles[weakest]!.fraction > _takeOver) {
        next[next.indexOf(weakest)] = e.key;
      }
    }
    final changed = !listEquals(next, _selected);
    _selected = next;

    // Prefetch: previews, then the visible tiles top-down, then the ones
    // a screen ahead.
    final want = <String>[];
    if (!_dataSaver && !web) {
      void add(String? u) {
        if (u != null && !want.contains(u)) want.add(u);
      }

      for (final id in _selected) {
        add(_tiles[id]?.url);
      }
      final shown = _tiles.values
          .where((t) => t.visible && t.fraction > 0)
          .toList()
        ..sort((a, b) => a.index.compareTo(b.index));
      for (final t in shown) {
        add(t.url);
      }
      for (final t in shown) {
        t.ahead.forEach(add);
      }
    }
    _prefetcher.drop(_wanted.where((u) => !want.contains(u)));
    _wanted = want;
    if (want.isNotEmpty) _prefetcher.prefetchAll(want);

    if (changed) _notifyLater();
  }

  /// Listeners are tiles; this can run while one is being torn down.
  void _notifyLater() => scheduleMicrotask(() {
        if (!_disposed) notifyListeners();
      });

  @override
  void dispose() {
    _disposed = true;
    _prefetcher.drop(_wanted);
    super.dispose();
  }
}

final gridVideoCoordinatorProvider = Provider<GridVideoCoordinator>((ref) {
  final c = GridVideoCoordinator(web: kIsWeb);
  ref
    ..listen(
      dataSaverProvider,
      (_, on) => c.setDataSaver(on: on),
      fireImmediately: true,
    )
    ..onDispose(c.dispose);
  return c;
});
