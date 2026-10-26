import 'dart:async';
import 'dart:collection' show Queue;

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/http_transport.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/config/client_tuning.dart';

/// Owner 2026-10-23 (Instagram: "content opens instantly"): how Instagram
/// and TikTok start a video at once is (1) the poster frame is on screen
/// from the first frame of the page, (2) the stream starts at a low
/// rendition with a short first segment and the ABR climbs after, (3) the
/// first bytes of the next 2–3 videos are fetched before the finger gets to
/// them, (4) a small, bounded set of players is kept ready (Meta moved from
/// many warm players to a preload manager exactly because players cost
/// memory and hardware decoders).
///
/// This file is (3): a bounded prefetch of an HLS stream's first bytes —
/// the master playlist, the LOWEST rendition's playlist and its first
/// segment. That heats the CDN edge (Bunny) and the OS URL cache, so the
/// player's own first requests are answered at once. It never keeps video on
/// our disk (the native players read through their own network stack), so
/// it adds nothing to the media cache limits.
class HlsPrefetcher {
  HlsPrefetcher({
    Dio? dio,
    this.maxConcurrent = 2,
    this.maxRemembered = 16,
    this.maxSegmentBytes = 1024 * 1024,
  }) : _dio = dio ?? _newDio();

  static Dio _newDio() {
    final d = Dio(BaseOptions(connectTimeout: _timeout));
    HttpTransport.apply(d); // S8-1: native stack, same connections as the API
    return d;
  }

  static const _timeout = Duration(seconds: 8);

  static final HlsPrefetcher instance = HlsPrefetcher();

  final Dio _dio;

  /// At most this many streams are fetched at once.
  final int maxConcurrent;

  /// At most this many streams are remembered as already warmed (LRU).
  final int maxRemembered;

  /// A first segment is never read past this size.
  final int maxSegmentBytes;

  final _done = <String>{};
  final _queue = Queue<String>();
  final _running = <String, CancelToken>{};

  @visibleForTesting
  int get running => _running.length;
  @visibleForTesting
  int get queued => _queue.length;
  @visibleForTesting
  int get rememberedCount => _done.length;
  @visibleForTesting
  bool warmed(String url) => _done.contains(url);

  /// Warms [url] (an `.m3u8`). Other links (an MP4) are ignored. Calling it
  /// again for the same stream is free.
  void prefetch(String url) {
    if (!url.contains('.m3u8')) return;
    if (_done.contains(url) ||
        _running.containsKey(url) ||
        _queue.contains(url)) {
      return;
    }
    // The newest wish is the one the viewer is closest to: it goes first.
    _queue.addFirst(url);
    // Only a handful of wishes are kept; the oldest are dropped.
    while (_queue.length > maxConcurrent + 2) {
      _queue.removeLast();
    }
    _pump();
  }

  /// Warms several in order (the nearest first).
  void prefetchAll(Iterable<String> urls) {
    for (final u in urls.toList().reversed) {
      prefetch(u);
    }
  }

  /// Drops everything waiting or running (leaving the player).
  void cancelAll() {
    _queue.clear();
    for (final t in _running.values) {
      t.cancel();
    }
  }

  /// Drops the wish for [urls]: waiting ones leave the queue, running ones
  /// are cancelled (their tiles scrolled far away). A stream that is
  /// already warmed stays remembered.
  void drop(Iterable<String> urls) {
    for (final u in urls) {
      _queue.remove(u);
      _running[u]?.cancel();
    }
  }

  void _pump() {
    while (_running.length < maxConcurrent && _queue.isNotEmpty) {
      final url = _queue.removeFirst();
      final token = CancelToken();
      _running[url] = token;
      unawaited(
        _fetch(url, token).whenComplete(() {
          _running.remove(url);
          _pump();
        }),
      );
    }
  }

  Future<void> _fetch(String url, CancelToken token) async {
    try {
      final master = await _text(url, token);
      final media = lowestRenditionUri(master, Uri.parse(url));
      var playlistUrl = Uri.parse(url);
      var playlist = master;
      if (media != null) {
        playlistUrl = media;
        playlist = await _text(media.toString(), token);
      }
      final segment = firstSegmentUri(playlist, playlistUrl);
      if (segment != null) await _head(segment, token);
      _done
        ..remove(url)
        ..add(url);
      while (_done.length > maxRemembered) {
        _done.remove(_done.first);
      }
    } on Object {
      // Quiet: the player simply fetches it itself.
    }
  }

  Future<String> _text(String url, CancelToken token) async {
    final r = await _dio.get<String>(
      url,
      cancelToken: token,
      options: Options(responseType: ResponseType.plain),
    );
    return r.data ?? '';
  }

  /// Reads the start of the first segment (enough to heat the edge cache).
  Future<void> _head(Uri segment, CancelToken token) async {
    await _dio.get<List<int>>(
      segment.toString(),
      cancelToken: token,
      options: Options(
        responseType: ResponseType.bytes,
        headers: {'Range': 'bytes=0-${maxSegmentBytes - 1}'},
        validateStatus: (s) => s != null && s < 400,
      ),
    );
  }
}

/// The playlist of the lowest-bandwidth variant of a master playlist, or
/// null when [master] is already a media playlist.
Uri? lowestRenditionUri(String master, Uri base) {
  final lines = master.split(RegExp(r'\r?\n'));
  int? bestBw;
  Uri? best;
  for (var i = 0; i < lines.length; i++) {
    final l = lines[i].trim();
    if (!l.startsWith('#EXT-X-STREAM-INF')) continue;
    final bw = int.tryParse(
          RegExp(r'(?<![A-Z-])BANDWIDTH=(\d+)').firstMatch(l)?.group(1) ?? '',
        ) ??
        1 << 40;
    for (var j = i + 1; j < lines.length; j++) {
      final next = lines[j].trim();
      if (next.isEmpty || next.startsWith('#')) continue;
      if (bestBw == null || bw < bestBw) {
        bestBw = bw;
        best = base.resolve(next);
      }
      break;
    }
  }
  return best;
}

/// The first segment of a media playlist, or null when it lists none.
Uri? firstSegmentUri(String playlist, Uri base) {
  for (final raw in playlist.split(RegExp(r'\r?\n'))) {
    final l = raw.trim();
    if (l.isEmpty || l.startsWith('#')) continue;
    return base.resolve(l);
  }
  return null;
}

/// Which pages of a vertical pager keep a player open / a stream warmed,
/// for the page on screen. Bounded on purpose: a player holds a hardware
/// decoder (phones have 3–4) and memory.
@immutable
class WarmPlan {
  const WarmPlan({required this.players, required this.prefetch});

  /// One player ahead, one behind, and the first bytes of the next
  /// [prefetchAhead] pages for the page [index] on screen of [count].
  factory WarmPlan.at(int index, int count) {
    return WarmPlan(
      players: {
        if (index + 1 < count) index + 1,
        if (index - 1 >= 0) index - 1,
      },
      prefetch: [
        for (var i = index + 1;
            i <= index + ClientTuning.videoPrefetchAhead && i < count;
            i++)
          i,
      ],
    );
  }

  /// Pages whose player is open and waits at the first frame.
  final Set<int> players;

  /// Pages whose first segment is fetched ahead (no player).
  final List<int> prefetch;

  static const maxPlayers = 2;

  /// Starter value; the server moves it (ClientTuning.videoPrefetchAhead).
  static const prefetchAhead = 3;
}
