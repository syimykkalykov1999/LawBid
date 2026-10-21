import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/notifications/application/task_reminders.dart';

import '../helpers/long_locale.dart';

/// Owner 2026-10-20: the «notifications are off» message of a reminder and
/// the notification-list line of a missed reminder on a 360 dp phone at
/// 110 % text, in the longest text of all languages, mirrored, and in the
/// owner's longest languages (Nepali, Arabic): no overflow.
void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };

  for (final e in locales.entries) {
    testWidgets('reminder texts, ${e.key}', (tester) async {
      useNarrowPhone(tester);
      final (t, dir) = e.value;
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(1.1),
            ),
            child: Directionality(textDirection: dir, child: child!),
          ),
          home: Scaffold(
            body: Builder(
              builder: (context) => Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.notifications_active_outlined),
                    title: Text(t.t('notif.cases.task_reminder.missed')),
                    subtitle: Text(
                      '${t.t('tasks.kind.meeting')} · 14:30',
                    ),
                  ),
                  TextButton(
                    onPressed: () => ScaffoldMessenger.of(context)
                        .showSnackBar(reminderPermissionSnackBar(t, () {})),
                    child: const Text('go'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.takeException(), isNull);
      expect(find.text(t.t('notif.system.off')), findsOneWidget);
    });
  }
}
