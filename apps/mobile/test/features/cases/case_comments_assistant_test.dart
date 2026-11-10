import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/screens/case_comments_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Click audit 2026-11-09 (#867 §L leftovers): a case's comments for an
/// assistant without the «cases» duty — the server answers 403
/// ASSISTANT_NOT_ALLOWED. The screen shows the same lock notice as the case
/// lists (no bare Retry that can only fail again) and no composer.
class _RefusingSocialRepository extends FakeSocialRepository {
  _RefusingSocialRepository(this.error);

  final ApiException error;

  @override
  Future<CursorPage<Comment>> comments(
    String postId, {
    String? cursor,
  }) async =>
      throw error;
}

void main() {
  Future<void> pump(WidgetTester tester, ApiException error) async {
    await tester.pumpWidget(
      uxApp(
        const CaseCommentsScreen(caseId: 'case-1'),
        theme: AppTheme.light(),
        overrides: uxOverrides(social: _RefusingSocialRepository(error)),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('assistant without the duty: lock notice, no Retry, no composer',
      (tester) async {
    await pump(
      tester,
      const ApiException(
        code: ApiErrorCodes.assistantNotAllowed,
        message: 'Only the attorney can do this.',
        statusCode: 403,
      ),
    );
    expect(find.byType(AppEmptyState), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
    expect(find.byType(CommentComposer), findsNothing);
  });

  testWidgets('any other server error keeps Retry and the composer',
      (tester) async {
    await pump(
      tester,
      const ApiException(code: 'INTERNAL_ERROR', message: 'x', statusCode: 500),
    );
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(CommentComposer), findsOneWidget);
  });
}
