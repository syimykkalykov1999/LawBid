import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';

import '../features/social/social_fakes.dart';
import '../helpers/ux_harness.dart';

/// Owner row 111: the reading screens (notifications, comments) meet the
/// tap-target and label guidelines in both themes, and at the phone's
/// largest common font size (2.0x, Android «Largest» / iOS AX2) their text
/// follows it in full (past the shell's 1.3x) without any overflow.
class _Repo implements NotificationsRepository {
  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async {
    if (readingFromPhoneOnly) throw StateError(kNoPhoneCopy);
    return CursorPage(
      items: [
        for (var i = 0; i < 4; i++)
          AppNotification(
            id: 'n$i',
            type: 'admin_broadcast',
            category: NotifCategory.system,
            payload: const {
              'title': 'Plan maintenance tonight between two and four',
            },
            aggregateCount: 1,
            readAt: i.isEven ? DateTime.now() : null,
            createdAt: DateTime.now(),
          ),
      ],
    );
  }

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

Comment _comment() => Comment(
      id: 'c1',
      postId: 'p1',
      author: const CommentAuthor(
        isAttorney: true,
        attorneyId: 'a1',
        username: 'nora',
        displayName: 'Nora Mills',
        verified: true,
      ),
      body: 'A comment long enough to wrap onto a second line of text.',
      likeCount: 3,
      replyCount: 2,
      likedByMe: false,
      canDelete: false,
      isMine: false,
      createdAt: DateTime.now().subtract(const Duration(hours: 1)),
    );

/// The app's own shell: [DeviceTextScale.shell] under the phone's setting.
Widget _shell(Widget child) =>
    Builder(builder: (c) => DeviceTextScale.shell(c, child: child));

Future<void> _guidelines(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
}

void main() {
  setUpAll(initializeDateFormatting);

  final themes = {'light': AppTheme.light(), 'dark': AppTheme.dark()};

  for (final theme in themes.entries) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('notifications, ${theme.key}, text ${scale}x',
          (tester) async {
        final handle = tester.ensureSemantics();
        await tester.pumpWidget(
          uxApp(
            _shell(const Scaffold(body: NotificationsView())),
            theme: theme.value,
            textScale: scale,
            overrides: uxOverrides(
              extra: [
                notificationsRepositoryProvider.overrideWithValue(_Repo()),
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final text = tester.widget<Text>(
          find.text('Plan maintenance tonight between two and four').first,
        );
        expect(
          MediaQuery.textScalerOf(tester.element(find.byWidget(text)))
              .scale(10),
          scale * 10,
        );
        await _guidelines(tester);
        handle.dispose();
      });

      testWidgets('comment, ${theme.key}, text ${scale}x', (tester) async {
        final handle = tester.ensureSemantics();
        await tester.pumpWidget(
          ProviderScope(
            overrides: uxOverrides(social: FakeSocialRepository()),
            child: MaterialApp(
              theme: theme.value,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: _shell(child!),
              ),
              home: Scaffold(
                body: SingleChildScrollView(
                  child: CommentTile(
                    comment: _comment(),
                    threads: true,
                    onReply: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await _guidelines(tester);
        handle.dispose();
      });
    }
  }
}
