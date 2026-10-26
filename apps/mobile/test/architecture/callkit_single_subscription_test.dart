import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-26 (the iPhone that never connected a call answered on the
/// lock screen, e8b0ab1fa): a Flutter event channel feeds its LAST
/// subscriber only — a second listener to the CallKit plugin's events took
/// them from the call controller. The app listens in ONE place,
/// `callkitEvents()` in callkit_bridge.dart; everything else subscribes to
/// that shared stream. This fails the moment a second direct subscriber
/// appears anywhere in lib/.
void main() {
  test('the CallKit event channel has exactly one subscriber', () {
    final direct = RegExp(
      r'FlutterCallkitIncoming\s*\.\s*onEvent|'
      r"EventChannel\(\s*'flutter_callkit_incoming_events'",
    );
    final hits = <String>[];
    for (final f
        in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      for (final m in direct.allMatches(src)) {
        final line = '\n'.allMatches(src.substring(0, m.start)).length + 1;
        hits.add('${f.path}:$line');
      }
    }
    expect(hits, hasLength(1), reason: hits.join('\n'));
    expect(
      hits.single,
      startsWith('lib/features/calls/application/callkit_bridge.dart'),
    );
  });

  test('every listener goes through the shared callkitEvents() stream', () {
    final src = File('lib/features/calls/application/callkit_bridge.dart')
        .readAsStringSync();
    // The shared stream is created once and handed out again after that.
    expect(src, contains('if (existing != null) return existing.stream;'));
    expect(src, contains('StreamController<CallEvent?>.broadcast()'));
  });
}
