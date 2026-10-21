import 'dart:typed_data';
import 'dart:ui' show Size;

/// Owner 2026-10-20: the shown size of an MP4 / MOV video read from its
/// `tkhd` (track header) box, as the server does (video-dimensions.ts), so
/// an outgoing video bubble has its final shape before the upload ends.
/// A phone video stored landscape with a 90° matrix comes back swapped.
/// Null when no video track header is found.
Size? videoSizeOf(Uint8List bytes) {
  final b = ByteData.sublistView(bytes);
  final tracks = <({int width, int height, bool rotated})>[];
  _walk(bytes, b, 0, bytes.length, 0, tracks);
  for (final t in tracks) {
    if (t.width > 0 && t.height > 0) {
      return t.rotated
          ? Size(t.height.toDouble(), t.width.toDouble())
          : Size(t.width.toDouble(), t.height.toDouble());
    }
  }
  return null;
}

const _containers = {'moov', 'trak', 'mdia', 'minf', 'edts'};

void _walk(
  Uint8List raw,
  ByteData b,
  int start,
  int end,
  int depth,
  List<({int width, int height, bool rotated})> out,
) {
  var off = start;
  while (off + 8 <= end && depth < 6) {
    var size = b.getUint32(off);
    final type = String.fromCharCodes(raw, off + 4, off + 8);
    var header = 8;
    if (size == 1) {
      if (off + 16 > end) return;
      final big = b.getUint64(off + 8);
      if (big > end - off) return;
      size = big;
      header = 16;
    } else if (size == 0) {
      size = end - off;
    }
    if (size < header || off + size > end) return;
    if (type == 'tkhd') {
      final t = _trackHeader(b, off + header, off + size);
      if (t != null) out.add(t);
    } else if (_containers.contains(type)) {
      _walk(raw, b, off + header, off + size, depth + 1, out);
    }
    off += size;
  }
}

({int width, int height, bool rotated})? _trackHeader(
  ByteData b,
  int start,
  int end,
) {
  final version = b.getUint8(start);
  final matrixAt = start + (version == 1 ? 52 : 40);
  final sizeAt = matrixAt + 36;
  if (sizeAt + 8 > end) return null;
  final a = b.getInt32(matrixAt);
  final bb = b.getInt32(matrixAt + 4);
  return (
    width: (b.getUint32(sizeAt) / 65536).round(),
    height: (b.getUint32(sizeAt + 4) / 65536).round(),
    rotated: a == 0 && bb.abs() == 0x10000,
  );
}
