import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/cases/presentation/screens/case_route_screens.dart';
import 'package:lawbid/features/cases/presentation/screens/edit_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/presentation/share_to_sheet.dart';
import 'package:lawbid/features/create/presentation/create_sheet.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_requests.dart';
import 'package:lawbid/features/onboarding/presentation/screens/legal_document_screen.dart';

import '../helpers/overflow_fixtures.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02, batch 1 of the screens no overflow test had covered:
/// the case screens (route, edit, work), legal documents, the chat folder
/// pills, and the create / share / group-requests sheets. 360 dp, the
/// longest text of every key, right-to-left, ne, de, mr, ar, ru, at text
/// scale 1 and 1.3; then the four themes in the longest text. Any
/// exception fails.
typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester)? act,
  bool client,
);

void main() {
  setUpAll(initializeDateFormatting);

  Widget opener(Future<void> Function(BuildContext, WidgetRef) open) =>
      Consumer(
        builder: (context, ref, _) => Scaffold(
          body: Center(
            child: TextButton(
              key: const Key('open'),
              onPressed: () => open(context, ref),
              child: const Text('open'),
            ),
          ),
        ),
      );

  /// The long case really is on screen (not a loading or error state).
  Future<void> showsLongCase(WidgetTester tester) async {
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.textContaining('Disputed commercial'), findsWidgets);
  }

  Future<void> tapOpen(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('open')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(BottomSheet), findsOneWidget);
  }

  // label -> (screen, optional action after the first frame)
  final cases = <String, _Case>{
    'case route (attorney)': (
      () => const CaseRouteScreen(caseId: 'c1'),
      null,
      false
    ),
    'case route (client)': (
      () => const CaseRouteScreen(caseId: 'c1'),
      null,
      true
    ),
    'edit case': (
      () => const EditCaseScreen(caseId: 'c1'),
      showsLongCase,
      true,
    ),
    'work case': (() => const WorkCaseScreen(caseId: 'c1'), null, false),
    'legal document': (
      () => const LegalDocumentScreen(docType: 'terms'),
      null,
      false
    ),
    'chat folders': (
      () => Scaffold(
            body: ChatFolderPills(
              value: ChatListFolder.primary,
              onChanged: (_) {},
            ),
          ),
      null,
      false,
    ),
    'create sheet': (() => opener(showCreateSheet), tapOpen, true),
    'share sheet': (
      () => opener(
            (c, ref) => showPostShareSheet(
              c,
              ref,
              postId: 'p1',
              link: 'https://lawbid.dev/p/p1',
              text: 'A very long text of a post to share with a friend',
            ).then((_) {}),
          ),
      tapOpen,
      false,
    ),
    'group requests': (
      () => opener((c, ref) => showGroupRequestsSheet(c, groupId: 'g1')),
      tapOpen,
      false,
    ),
  };

  for (final scale in overflowScales) {
    for (final MapEntry(key: name, value: (t, dir))
        in overflowLocales().entries) {
      group('batch 1: no overflow at 360 dp ($name, x$scale)', () {
        for (final MapEntry(key: label, value: (build, act, client))
            in cases.entries) {
          testWidgets(label, (tester) async {
            await pumpOverflowApp(
              tester,
              build(),
              t: t,
              dir: dir,
              scale: scale,
              act: act,
              client: client,
              cases: LongCasesRepository(),
            );
          });
        }
      });
    }
  }

  final longest = overflowLocales().entries.first.value;
  for (final themeId in overflowThemes) {
    group('batch 1: themes (${themeId.name}, longest, x1.3)', () {
      for (final MapEntry(key: label, value: (build, act, client))
          in cases.entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: longest.$1,
            dir: longest.$2,
            scale: overflowScales.last,
            theme: themeId,
            act: act,
            client: client,
            cases: LongCasesRepository(),
          );
        });
      }
    });
  }
}
