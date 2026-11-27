import 'package:flutter/gestures.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/platform/web_context_menu.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:material_ui/material_ui.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Row 109: a comment deleted with «Undo» that the server then refuses
/// comes back and the reason is shown. Before 26.11 the reason went to the
/// messenger's own context (no messenger above it), so it was never seen.
class _Refusing extends FakeSocialRepository {
  int deletes = 0;

  @override
  Future<void> deleteComment(String commentId) async {
    deletes++;
    throw const ApiException(
      code: ApiErrorCodes.internalError,
      message: 'refused',
    );
  }
}

void main() {
  setUpAll(initializeDateFormatting);
  setUp(
    () => VisibilityDetectorController.instance.updateInterval = Duration.zero,
  );
  tearDown(() => debugWebContextMenuOverride = null);

  final comment = Comment(
    id: 'c1',
    postId: 'p1',
    author: const CommentAuthor(
      isAttorney: false,
      username: 'samk',
      displayName: 'Sam K.',
      verified: false,
    ),
    body: 'Nice post',
    likeCount: 0,
    replyCount: 0,
    likedByMe: false,
    canDelete: true,
    isMine: true,
    createdAt: DateTime.now().subtract(const Duration(hours: 1)),
  );

  testWidgets('a refused delete shows the error snackbar', (tester) async {
    debugWebContextMenuOverride = true;
    final repo = _Refusing();
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(social: repo),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: CommentTile(comment: comment, onReply: (_) {}),
          ),
        ),
      ),
    );
    await tester.pump();
    final g = await tester.startGesture(
      tester.getCenter(find.text('Sam K.')),
      kind: PointerDeviceKind.mouse,
      buttons: kSecondaryMouseButton,
    );
    await g.up();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete comment').last);
    await tester.pumpAndSettle();
    // The confirm sheet.
    await tester.tap(find.text('Delete comment').last);
    await tester.pumpAndSettle();
    expect(find.text('Comment deleted'), findsOneWidget);

    await tester.pump(ClientTuning.undoWindow + const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(repo.deletes, 1);
    expect(tester.takeException(), isNull);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(find.text('Comment deleted'), findsNothing);
  });
}
