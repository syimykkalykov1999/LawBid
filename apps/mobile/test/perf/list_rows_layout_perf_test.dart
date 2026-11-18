import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:material_ui/material_ui.dart';

import '../features/social/social_fakes.dart';
import '../helpers/ux_harness.dart';

/// Owner row 128 (PERF_DETECTIVE 2026-11-13 A4): list rows without
/// IntrinsicHeight. Each case lays a long list out again at two widths
/// ([_frames] frames) and prints the layout phase of the fastest and the
/// median frame (the fastest is the least disturbed by other work on the
/// machine); the numbers before and after the change are in the PR. No
/// timing is asserted (host timing is noisy); the test fails on any layout
/// error, so it also guards the new layouts (no overflow, no negative
/// heights).
const _frames = 60;

Future<String> _medianFrameMs(WidgetTester tester) async {
  final times = <int>[];
  final owner = tester.binding.renderViews.first.owner!;
  for (var i = 0; i < _frames; i++) {
    await tester.binding.setSurfaceSize(Size(i.isEven ? 390 : 430, 2400));
    tester.binding.renderViews.first.configuration =
        tester.binding.createViewConfigurationFor(
      tester.binding.renderViews.first,
    );
    final sw = Stopwatch()..start();
    owner.flushLayout();
    times.add(sw.elapsedMicroseconds);
    await tester.pump();
  }
  await tester.binding.setSurfaceSize(null);
  times.sort();
  return 'layout min ${times.first / 1000} median '
      '${times[times.length ~/ 2] / 1000}';
}

class _Notifications implements NotificationsRepository {
  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async {
    if (readingFromPhoneOnly) throw StateError(kNoPhoneCopy);
    return CursorPage(
      items: [
        for (var i = 0; i < 40; i++)
          AppNotification(
            id: 'n$i',
            type: 'admin_broadcast',
            category: NotifCategory.system,
            payload: {'title': 'Plan maintenance number $i tonight at 2'},
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

Comment _comment(int i) => Comment(
      id: 'c$i',
      postId: 'p1',
      author: const CommentAuthor(
        isAttorney: true,
        attorneyId: 'a1',
        username: 'nora',
        displayName: 'Nora Mills',
        verified: true,
      ),
      body: 'A comment long enough to wrap onto a second line, number $i.',
      likeCount: i,
      replyCount: i.isEven ? 2 : 0,
      likedByMe: false,
      canDelete: false,
      isMine: false,
      createdAt: DateTime.now().subtract(const Duration(hours: 1)),
    );

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('notification rows', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: NotificationsView()),
        theme: AppTheme.light(),
        overrides: uxOverrides(
          extra: [
            notificationsRepositoryProvider.overrideWithValue(_Notifications()),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    // ignore: avoid_print
    print('PERF notifications ms: '
        '${await _medianFrameMs(tester)}');
    expect(tester.takeException(), isNull);
  });

  testWidgets('comment rows', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(social: FakeSocialRepository()),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: Column(
                children: [
                  for (var i = 0; i < 30; i++)
                    CommentTile(
                      comment: _comment(i),
                      threads: true,
                      onReply: (_) {},
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // ignore: avoid_print
    print('PERF comments ms: '
        '${await _medianFrameMs(tester)}');
    expect(tester.takeException(), isNull);
  });

  // Row 128 (2026-11-17): the fifth row keeps its IntrinsicHeight. A known
  // height (padding + icon + fontSize x height) came out 0.4 px short of
  // the real line (overflow), and the measured layout of 30 cards was the
  // same either way (~0.8 ms median); this case guards that number.
  testWidgets('contact card rows', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: Column(
                children: [
                  for (var i = 0; i < 30; i++)
                    ChatBubbleShell(
                      mine: i.isEven,
                      child: ContactCardBody(
                        card: ContactCard(
                          userId: 'u$i',
                          username: 'nora$i',
                          displayName: 'Nora Mills $i',
                          verified: true,
                          licensedStates: const ['NY'],
                        ),
                        mine: i.isEven,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // ignore: avoid_print
    print('PERF contact cards ms: '
        '${await _medianFrameMs(tester)}');
    expect(tester.takeException(), isNull);
  });
}
