import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

/// Round 1 app check 25.11 (pack A, KNOWN_ERRORS 230): about 45 sheets and
/// screens closed themselves with `await …; if (mounted)
/// Navigator.of(context).pop()`. A sheet swiped away during the wait is
/// still mounted while it slides out, so the late pop closed the page UNDER
/// it — the chat, the case, the profile.
void main() {
  Future<NavigatorState> pumpChat(WidgetTester tester, Widget sheet) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const Scaffold(body: Text('feed')),
        ),
      ),
    );
    final nav = tester.state<NavigatorState>(find.byType(Navigator).first);
    nav
        .push(
          MaterialPageRoute<void>(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showAppBottomSheet<Object?>(
                  context: context,
                  builder: (_) => sheet,
                ),
                child: const Text('chat'),
              ),
            ),
          ),
        )
        .ignore();
    await tester.pumpAndSettle();
    await tester.tap(find.text('chat'));
    await tester.pumpAndSettle();
    return nav;
  }

  group('popIfCurrent', () {
    testWidgets('on top: pops this sheet with the result', (tester) async {
      late BuildContext sheet;
      await pumpChat(
        tester,
        Builder(
          builder: (context) {
            sheet = context;
            return const SizedBox(height: 200, child: Text('sheet'));
          },
        ),
      );
      expect(sheet.popIfCurrent(true), isTrue);
      await tester.pumpAndSettle();
      expect(find.text('sheet'), findsNothing);
      expect(find.text('chat'), findsOneWidget);
    });

    testWidgets('swiped away during the wait: the page under it stays',
        (tester) async {
      late BuildContext sheet;
      final nav = await pumpChat(
        tester,
        Builder(
          builder: (context) {
            sheet = context;
            return const SizedBox(height: 200, child: Text('sheet'));
          },
        ),
      );
      // The swipe: the sheet starts leaving, still mounted while it slides.
      nav.pop();
      await tester.pump();
      expect(sheet.mounted, isTrue);
      expect(sheet.popIfCurrent<void>(), isFalse);
      expect(await sheet.maybePopIfCurrent<void>(), isFalse);
      await tester.pumpAndSettle();
      expect(find.text('chat'), findsOneWidget);
    });

    testWidgets('covered by a newer page: nothing pops', (tester) async {
      late BuildContext sheet;
      final nav = await pumpChat(
        tester,
        Builder(
          builder: (context) {
            sheet = context;
            return const SizedBox(height: 200, child: Text('sheet'));
          },
        ),
      );
      nav
          .push(
            MaterialPageRoute<void>(
              builder: (_) => const Scaffold(body: Text('call')),
            ),
          )
          .ignore();
      await tester.pumpAndSettle();
      expect(sheet.isCurrentRoute, isFalse);
      expect(sheet.popIfCurrent<void>(), isFalse);
      await tester.pumpAndSettle();
      expect(find.text('call'), findsOneWidget);
    });
  });

  testWidgets(
      'a real sheet (group name): swiped away while it saves — the chat '
      'under it stays', (tester) async {
    final saving = Completer<String?>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const Scaffold(body: Text('feed')),
        ),
      ),
    );
    final nav = tester.state<NavigatorState>(find.byType(Navigator).first);
    nav
        .push(
          MaterialPageRoute<void>(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showGroupTextSheet(
                  context,
                  title: 'Name',
                  initial: 'Old',
                  maxLength: 40,
                  submit: (_) => saving.future,
                ),
                child: const Text('chat'),
              ),
            ),
          ),
        )
        .ignore();
    await tester.pumpAndSettle();
    await tester.tap(find.text('chat'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'New');
    await tester.tap(find.text('Save'));
    await tester.pump();
    // Swiped away while the server saves…
    nav.pop();
    await tester.pump(const Duration(milliseconds: 100));
    // …the answer comes while the sheet still slides out.
    saving.complete(null);
    await tester.pumpAndSettle();

    expect(find.text('chat'), findsOneWidget);
    expect(find.text('feed'), findsNothing);
  });

  // A source guard: no `await …; if (mounted) Navigator.of(context).pop()`
  // comes back in the places the round 1 check listed.
  test('the listed late pops go through popIfCurrent', () {
    const sites = {
      'lib/features/chat/presentation/forward_sheet.dart',
      'lib/features/chat/presentation/share_to_sheet.dart',
      'lib/features/groups/presentation/widgets/group_topic_sheets.dart',
      'lib/features/groups/presentation/widgets/group_info_sheets.dart',
      'lib/features/groups/presentation/widgets/group_info_settings.dart',
      'lib/features/chat/presentation/quick_replies_sheet.dart',
      'lib/features/cases/tools/signing_sheets.dart',
      'lib/features/cases/tools/template_form_sheet.dart',
      'lib/features/cases/presentation/widgets/client_review_sheet.dart',
      'lib/features/cases/presentation/widgets/change_bid_sheet.dart',
      'lib/features/cases/presentation/widgets/case_urgency_picker.dart',
      'lib/features/cases/presentation/widgets/offer_case_sheet.dart',
      'lib/features/case_payments/presentation/payment_request_sheet.dart',
      'lib/features/consultations/presentation/booking_sheet.dart',
      'lib/features/team/presentation/seat_limit_note.dart',
      'lib/features/team/presentation/assistant_code_card.dart',
      'lib/features/demo/presentation/demo_section.dart',
      'lib/features/demo/presentation/demo_code_sheet.dart',
      'lib/features/auth/presentation/widgets/passkey_nudge_sheet.dart',
      'lib/features/auth/presentation/widgets/country_waitlist_sheet.dart',
      'lib/features/verification/presentation/widgets/license_sheet.dart',
      'lib/features/subscription/presentation/seat_purchase_sheet.dart',
      'lib/features/stories/presentation/story_settings_screen.dart',
      'lib/features/stories/presentation/story_viewer_sheets.dart',
      'lib/features/stickers/presentation/sticker_widgets.dart',
      'lib/features/promotions/presentation/boost_wizard.dart',
      'lib/features/settings/account/presentation/widgets/role_switch_sheet.dart',
    };
    final latePop = RegExp(
      r'await [^;]+;[\s\S]{0,400}?(?:if \((?:context\.)?mounted\) )?'
      r'Navigator\.of\(context\)\.pop\(',
    );
    final offenders = <String>[];
    for (final path in sites) {
      final src = File(path).readAsStringSync();
      for (final m in latePop.allMatches(src)) {
        final hit = m.group(0)!;
        // The pop belongs to a dialog / picker callback, not this route.
        if (hit.contains('onPressed: () =>')) continue;
        if (!hit.contains('mounted')) continue;
        offenders.add(path);
        break;
      }
    }
    expect(offenders, isEmpty);
  });
}
