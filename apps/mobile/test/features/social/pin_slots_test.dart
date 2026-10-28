import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28: up to six pinned posts — the pin sheet shows the
/// circles 1..6 in two rows of three; any of them pins.
void main() {
  setUpAll(initializeDateFormatting);

  final post = Post(
    id: 'p1',
    author: const PostAuthor(
      id: 'a1',
      username: 'sofia.hernandez',
      firstName: 'Sofia',
      lastName: 'Hernandez',
      verified: true,
    ),
    body: 'Text',
    media: const [],
    tags: const [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    savedByMe: false,
    isMine: true,
    createdAt: DateTime(2026, 10, 20),
  );

  Future<void> pumpSheet(WidgetTester t, _PinRepo repo) async {
    t.view.physicalSize = const Size(360, 800);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => showPinSlotSheet(context, ref, post),
              child: const Text('open'),
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(360, 800),
        overrides: uxOverrides(social: repo),
      ),
    );
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
  }

  testWidgets('six slots in two rows of three', (t) async {
    await pumpSheet(t, _PinRepo());
    for (var s = 1; s <= 6; s++) {
      expect(find.byKey(ValueKey('pin-slot-$s')), findsOneWidget);
    }
    expect(find.byKey(const ValueKey('pin-slot-7')), findsNothing);
    final one = t.getRect(find.byKey(const ValueKey('pin-slot-1')));
    final three = t.getRect(find.byKey(const ValueKey('pin-slot-3')));
    final four = t.getRect(find.byKey(const ValueKey('pin-slot-4')));
    expect(three.top, one.top);
    expect(four.top, greaterThan(one.bottom));
    expect(four.left, closeTo(one.left, 1));
    expect(t.takeException(), isNull);
  });

  testWidgets('slot 5 pins to 5', (t) async {
    final repo = _PinRepo();
    await pumpSheet(t, repo);
    await t.tap(find.byKey(const ValueKey('pin-slot-5')));
    await t.pumpAndSettle();
    expect(repo.pins, [('p1', 5)]);
  });
}

class _PinRepo extends FakeSocialRepository {
  final pins = <(String, int)>[];

  @override
  Future<Post> pinPost(String id, int slot) async {
    pins.add((id, slot));
    return Post(
      id: id,
      author: const PostAuthor(
        id: 'a1',
        username: 'sofia.hernandez',
        firstName: 'Sofia',
        lastName: 'Hernandez',
        verified: true,
      ),
      body: 'Text',
      media: const [],
      tags: const [],
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      isMine: true,
      createdAt: DateTime(2026, 10, 20),
      pinSlot: slot,
    );
  }
}
