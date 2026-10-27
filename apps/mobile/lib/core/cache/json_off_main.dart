import 'dart:convert';

import 'package:flutter/foundation.dart';

/// Owner 2026-10-26 (smoothness): JSON read back from the phone's disk (a
/// chat's 50 messages, a cached feed page) is decoded away from the UI
/// thread when it is big, so opening a chat or a screen does not drop
/// frames. Below this many characters a background isolate costs more than
/// it saves, so the text is decoded in place.
const int kOffMainJsonChars = 48 * 1024;

/// Decodes [rows] (one JSON text each) and turns every one into a [T] with
/// [map], in the same order.
///
/// * Phone / desktop, [threshold] characters or more in all: one
///   background isolate decodes and maps them all ([map] must be a
///   top-level or static function, or a closure over sendable values).
/// * Web (no isolates): the work is cut every 10 rows, so a frame can be
///   drawn in between.
/// * Otherwise: decoded in place, as before.
Future<List<T>> decodeJsonRows<T>(
  List<String> rows,
  T Function(Object? json) map, {
  int threshold = kOffMainJsonChars,
  @visibleForTesting bool? web,
}) async {
  final onWeb = web ?? kIsWeb;
  if (!onWeb) {
    var total = 0;
    for (final r in rows) {
      total += r.length;
    }
    if (total >= threshold) {
      return compute(
        (List<String> rs) => [for (final r in rs) map(jsonDecode(r))],
        rows,
        debugLabel: 'decodeJsonRows',
      );
    }
    return [for (final r in rows) map(jsonDecode(r))];
  }
  final out = <T>[];
  for (var i = 0; i < rows.length; i++) {
    if (i > 0 && i % 10 == 0) await Future<void>.delayed(Duration.zero);
    out.add(map(jsonDecode(rows[i])));
  }
  return out;
}

/// One JSON text: decoded in a background isolate on phone / desktop when
/// it is [threshold] characters or more, in place otherwise (and on web).
Future<Object?> decodeJsonOffMain(
  String json, {
  int threshold = kOffMainJsonChars,
  @visibleForTesting bool? web,
}) async {
  if ((web ?? kIsWeb) || json.length < threshold) return jsonDecode(json);
  return compute(jsonDecode, json, debugLabel: 'decodeJsonOffMain');
}
