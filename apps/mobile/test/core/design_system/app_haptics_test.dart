import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';

/// 2026-10-26 (smoothness P7): the haptics wrapper sends exactly the
/// platform call the old direct [HapticFeedback] calls sent, and nothing in
/// `lib/` buzzes around it.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final calls = <String>[];
  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') {
        calls.add(call.arguments as String);
      }
      return null;
    });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  test('each strength is the same platform call as before', () async {
    await AppHaptics.selection();
    await AppHaptics.light();
    await AppHaptics.medium();
    await AppHaptics.heavy();
    expect(calls, [
      'HapticFeedbackType.selectionClick',
      'HapticFeedbackType.lightImpact',
      'HapticFeedbackType.mediumImpact',
      'HapticFeedbackType.heavyImpact',
    ]);
  });

  test('lib/ calls HapticFeedback only through AppHaptics', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      if (f.path.endsWith('core/design_system/haptics/app_haptics.dart')) {
        continue;
      }
      final code = f
          .readAsLinesSync()
          .where((l) => !l.trimLeft().startsWith('//'))
          .join('\n');
      if (code.contains('HapticFeedback.')) offenders.add(f.path);
    }
    expect(offenders, isEmpty, reason: 'use AppHaptics');
  });
}
