import 'package:flutter/foundation.dart';

/// N-1: the pure maths of the video chunk cache (no I/O, fully tested).

/// Bytes cached from the start of an MP4: [seconds] of video at an assumed
/// [bytesPerSecond] (default 250 KB/s ≈ 2 Mbit/s, the size of a chat clip
/// after the phone compressed it), rounded up to whole [blockSize] blocks.
int headBytesFor({
  required int seconds,
  int bytesPerSecond = 250 * 1024,
  int blockSize = kBlockSize,
}) {
  if (seconds <= 0) return 0;
  final raw = seconds * bytesPerSecond;
  return ((raw + blockSize - 1) ~/ blockSize) * blockSize;
}

const kBlockSize = 256 * 1024;

/// One block of a file: bytes [start]..[endInclusive].
@immutable
class BlockRange {
  const BlockRange(this.index, this.start, this.endInclusive);
  final int index;
  final int start;
  final int endInclusive;

  /// The value of the upstream `Range` header for this block.
  String get header => 'bytes=$start-$endInclusive';

  @override
  bool operator ==(Object other) =>
      other is BlockRange &&
      other.index == index &&
      other.start == start &&
      other.endInclusive == endInclusive;

  @override
  int get hashCode => Object.hash(index, start, endInclusive);

  @override
  String toString() => 'Block($index $start-$endInclusive)';
}

/// The blocks covering [start]..[endInclusive] that lie inside the cached
/// head (`< headBytes`). The tail past the head is not cached.
List<BlockRange> headBlocks({
  required int start,
  required int endInclusive,
  required int headBytes,
  int blockSize = kBlockSize,
}) {
  if (headBytes <= 0 || start >= headBytes || endInclusive < start) {
    return const [];
  }
  final last = (endInclusive < headBytes ? endInclusive : headBytes - 1);
  return [
    for (var i = start ~/ blockSize; i <= last ~/ blockSize; i++)
      BlockRange(i, i * blockSize, (i + 1) * blockSize - 1),
  ];
}

/// Parses `Range: bytes=a-b` / `a-` / `-n` against a file of [total]
/// bytes. Returns (start, endInclusive) or null when absent or invalid.
(int, int)? parseRange(String? header, int total) {
  if (header == null || total <= 0) return null;
  final m = RegExp(r'^bytes=(\d*)-(\d*)$').firstMatch(header.trim());
  if (m == null) return null;
  final a = m.group(1)!;
  final b = m.group(2)!;
  if (a.isEmpty && b.isEmpty) return null;
  int s;
  int e;
  if (a.isEmpty) {
    final n = int.parse(b);
    if (n == 0) return null;
    s = total - n < 0 ? 0 : total - n;
    e = total - 1;
  } else {
    s = int.parse(a);
    e = b.isEmpty ? total - 1 : int.parse(b);
    if (e >= total) e = total - 1;
  }
  if (s > e || s >= total) return null;
  return (s, e);
}

/// Total size from an upstream `Content-Range: bytes a-b/total`.
int? totalFromContentRange(String? value) {
  final m = RegExp(r'/(\d+)\s*$').firstMatch(value ?? '');
  return m == null ? null : int.parse(m.group(1)!);
}

/// Which segments of an HLS media playlist fall inside the first [seconds]
/// of the video: indexes into the playlist's segment list. At least the
/// first segment is always included when [seconds] > 0.
int cachedSegmentCount(String playlist, int seconds) {
  if (seconds <= 0) return 0;
  var acc = 0.0;
  var n = 0;
  double? dur;
  for (final raw in playlist.split(RegExp(r'\r?\n'))) {
    final l = raw.trim();
    if (l.startsWith('#EXTINF:')) {
      dur = double.tryParse(l.substring(8).split(',').first);
    } else if (l.isNotEmpty && !l.startsWith('#')) {
      if (n > 0 && acc >= seconds) break;
      acc += dur ?? 0;
      n++;
      dur = null;
    }
  }
  return n;
}

/// Rewrites a playlist so every URI line (and `URI="…"` attribute) goes
/// through the local proxy; the first [cachedSegments] segments use the
/// caching path, everything else (and nested playlists) the plain path.
/// [wrap] builds the proxy URL for (absolute upstream URL, cache?).
String rewritePlaylist(
  String playlist,
  Uri base,
  int cachedSegments,
  String Function(Uri upstream, {required bool cache, required bool isPlaylist})
      wrap,
) {
  final out = <String>[];
  var seg = 0;
  for (final raw in playlist.split(RegExp(r'\r?\n'))) {
    final l = raw.trim();
    if (l.isEmpty) {
      out.add(raw);
    } else if (l.startsWith('#')) {
      out.add(
        raw.replaceAllMapped(RegExp('URI="([^"]+)"'), (m) {
          final u = base.resolve(m.group(1)!);
          final isPl = u.path.endsWith('.m3u8');
          return 'URI="${wrap(u, cache: false, isPlaylist: isPl)}"';
        }),
      );
    } else {
      final u = base.resolve(l);
      final isPl = u.path.endsWith('.m3u8');
      final cache = !isPl && seg < cachedSegments;
      if (!isPl) seg++;
      out.add(wrap(u, cache: cache, isPlaylist: isPl));
    }
  }
  return out.join('\n');
}
