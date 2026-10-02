import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

import '../helpers/ux_harness.dart';

/// Owner 2026-10-01: one share sheet with the social networks.
void main() {
  testWidgets('lists the networks; Copy puts the link on the clipboard',
      (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String?;
        }
        return null;
      },
    );
    bool? result;
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async => result = await showShareSheet(
                context,
                t: const StaticTranslatorEn(),
                link: 'https://lawbid.app/post/1',
                text: 'Custody basics',
              ),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    for (final key in [
      'whatsapp',
      'telegram',
      'instagram',
      'tiktok',
      'facebook',
      'messenger',
      'x',
      'linkedin',
      'viber',
      'sms',
      'email',
      'more',
    ]) {
      expect(find.byKey(ValueKey('share-$key')), findsOneWidget, reason: key);
    }
    await tester.tap(find.byKey(const ValueKey('share-copy')));
    await tester.pumpAndSettle();
    expect(copied, 'https://lawbid.app/post/1');
    expect(result, isTrue);
  });
}
