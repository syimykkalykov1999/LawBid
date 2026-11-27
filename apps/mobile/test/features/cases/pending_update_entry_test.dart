import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/cases/workspace/case_files_outbox.dart';
import 'package:lawbid/features/cases/workspace/pending_update_entry.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

PendingCaseUpdate _update({String? failedCode}) => PendingCaseUpdate(
      job: UploadJob(
        id: 'job-1',
        ownerId: 'me',
        kind: kCaseFilesJobKind,
        target: 'case:c1',
        payload: const {},
        createdAt: DateTime(2026, 11, 26),
        failedCode: failedCode,
      ),
      body: 'Contract attached',
      files: const [
        {
          'name': 'video.mp4',
          'description': 'The meeting',
          'mime': 'video/mp4',
        },
        {'name': 'a.pdf', 'description': '', 'mime': 'application/pdf'},
      ],
      previews: const [null, null],
    );

/// Case audit 26.11: an update with files shows at once while it is sent
/// (the 1:1 chat's ring on each file), and a refused one offers Retry /
/// Delete instead of vanishing.
void main() {
  Future<void> pump(WidgetTester tester, PendingCaseUpdate u) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(body: PendingUpdateEntry(update: u)),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
  }

  testWidgets('sending: text, files and a ring on each', (tester) async {
    await pump(tester, _update());
    expect(find.text('Sending'), findsOneWidget);
    expect(find.text('Contract attached'), findsOneWidget);
    expect(find.text('The meeting'), findsOneWidget);
    expect(find.text('a.pdf'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNWidgets(2));
    expect(find.text('Retry'), findsNothing);
  });

  testWidgets('refused: «Not sent» with Retry and Delete', (tester) async {
    await pump(tester, _update(failedCode: 'FILE_TYPE_NOT_ALLOWED'));
    expect(find.text('Not sent'), findsOneWidget);
    expect(find.byKey(const ValueKey('pending-update-retry')), findsOneWidget);
    expect(find.byKey(const ValueKey('pending-update-delete')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });
}
