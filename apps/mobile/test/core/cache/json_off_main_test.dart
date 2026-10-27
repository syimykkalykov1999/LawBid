import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/json_off_main.dart';

/// Owner 2026-10-26 (smoothness): JSON from the phone's disk is decoded
/// off the UI thread when it is big — with exactly the same result.
List<String> _rows(int n) => [
      for (var i = 0; i < n; i++)
        jsonEncode({
          'id': 'm$i',
          'body': 'message $i ${'x' * 200}',
          'tags': [i, i + 1],
        }),
    ];

String _idOf(Object? json) => (json! as Map)['id'] as String;

void main() {
  test('small: decoded in place, same order', () async {
    final rows = _rows(5);
    expect(await decodeJsonRows(rows, _idOf), ['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  test('big: decoded in a background isolate, same result', () async {
    final rows = _rows(400); // ~90 KB, above the threshold
    final chars = rows.fold<int>(0, (n, r) => n + r.length);
    expect(chars, greaterThan(kOffMainJsonChars));
    final ids = await decodeJsonRows(rows, _idOf);
    expect(ids, [for (var i = 0; i < 400; i++) 'm$i']);
    final maps = await decodeJsonRows(rows, (j) => j);
    expect(maps, [for (final r in rows) jsonDecode(r)]);
  });

  test('web: the work is cut every 10 rows (frames can be drawn)', () async {
    final rows = _rows(35);
    var ticks = 0;
    var done = false;
    // A timer that counts how often the event loop got a turn meanwhile.
    void tick() {
      if (done) return;
      ticks++;
      Timer.run(tick);
    }

    Timer.run(tick);
    final ids = await decodeJsonRows(rows, _idOf, web: true);
    done = true;
    expect(ids.length, 35);
    expect(ids.last, 'm34');
    expect(ticks, greaterThanOrEqualTo(3));
  });

  test('one big text: same as jsonDecode on both paths', () async {
    final big = jsonEncode({'items': _rows(400)});
    expect(await decodeJsonOffMain(big), jsonDecode(big));
    expect(await decodeJsonOffMain(big, web: true), jsonDecode(big));
    expect(await decodeJsonOffMain('{"a":1}'), {'a': 1});
  });
}
