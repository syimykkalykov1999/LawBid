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

  /// The native side of the same rule (iPhone «Answer» dropped the call,
  /// e8b0ab1fa): ONE CallKit provider — the plugin's. The app only
  /// observes (CXCallObserver) and asks iOS (CXCallController); it never
  /// creates a second CXProvider whose delegate would race the plugin's.
  test('iOS: no second CallKit provider in the app', () {
    final hits = <String>[];
    for (final f in Directory('ios/Runner')
        .listSync(recursive: true)
        .whereType<File>()) {
      if (!f.path.endsWith('.swift')) continue;
      if (RegExp(r'CXProvider\s*\(').hasMatch(f.readAsStringSync())) {
        hits.add(f.path);
      }
    }
    expect(hits, isEmpty, reason: hits.join('\n'));
  });

  test('iOS: «Answer» is confirmed to CallKit at once, never ended', () {
    final src = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    final accept = RegExp(r'func onAccept\([^)]*\)\s*\{([^}]*)\}')
        .firstMatch(src);
    expect(accept, isNotNull);
    expect(accept!.group(1)!.trim(), 'action.fulfill()');
  });

  /// LC-1 (audit 2026-10-26): a cancelled ring stops a locked iPhone at
  /// once through the VoIP channel; every VoIP push still reports a call.
  test('iOS: the VoIP «call_ended» push ends the ringing CallKit call', () {
    final src = File('ios/Runner/AppDelegate.swift').readAsStringSync();
    expect(src, contains('"call_ended"'));
    expect(src, contains('handleCallEndedPush(callkit, p, completion: completion)'));
    // Ends through iOS (the plugin's provider performs it), only a call
    // that is still ringing here — never the one answered on this phone.
    expect(src, contains('CXEndCallAction(call: uuid)'));
    expect(src, contains('!ringing.hasConnected && !ringing.isOutgoing'));
    // Nothing shown: report-then-end (iOS kills apps that skip it).
    expect(src, contains('reportThenEnd(callkit'));
    // A ring arriving after its stop does not ring for 45 s.
    expect(src, contains('if wasEndedByPush(callId)'));
  });
}
