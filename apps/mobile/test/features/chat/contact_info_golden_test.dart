import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';

import 'contact_info_test.dart'
    show FakeContactChat, contactTestApp, contactTestFile, makeConv;

/// Owner 2026-10-18: «Данные контакта» like WhatsApp, in Day and Night.
void main() {
  setUpAll(initializeDateFormatting);
  for (final entry in {
    'light': AppTheme.light(),
    'dark': AppTheme.dark(),
  }.entries) {
    testGoldens('contact info - ${entry.key}', (tester) async {
      final chat = FakeContactChat(
        makeConv(caseId: 'k1', caseTitle: 'Speeding ticket'),
        attachmentItems: [
          for (var i = 0; i < 6; i++)
            contactTestFile('p$i', 'a$i.jpg', image: true, mime: 'image/jpeg'),
        ],
      );
      tester.view.physicalSize = const Size(390, 820);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        contactTestApp(
          chat,
          ContactInfoScreen(conversationId: 'c1', onCall: () {}),
          pushed: [],
          theme: entry.value,
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(milliseconds: 200));
      await screenMatchesGolden(tester, 'contact_info_${entry.key}');
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
    });
  }
}
