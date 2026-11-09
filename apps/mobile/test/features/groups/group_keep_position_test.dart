import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Audit 26.10 B3 (Telegram / WhatsApp): in a group too, a new incoming
/// message while the person reads above does not move the text on screen.
void main() {
  setUpAll(initializeDateFormatting);

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  testWidgets('a new group message does not move what is read', (tester) async {
    final events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false),
      [
        for (var i = 59; i >= 0; i--)
          message('m$i', body: 'note $i', minutes: i, mine: i.isOdd),
      ],
    );
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            partnerOffOverride,
            groupRepositoryProvider.overrideWithValue(repo),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
            realtimeEventsProvider.overrideWithValue(events.stream),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const GroupConversationScreen(groupId: 'g1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));

    final list = find.byType(Scrollable).first;
    final view = tester.getRect(list);
    final g = await tester.startGesture(view.center);
    for (var i = 0; i < 20; i++) {
      await g.moveBy(const Offset(0, 25));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await g.up();
    await tester.pumpAndSettle();
    Finder? watched;
    for (var i = 59; i >= 0; i--) {
      final f = find.text('note $i');
      if (f.evaluate().isEmpty) continue;
      final y = tester.getCenter(f).dy;
      if (y > view.top + view.height * 0.3 &&
          y < view.top + view.height * 0.7) {
        watched = f;
        break;
      }
    }
    expect(watched, isNotNull);
    final before = tester.getTopLeft(watched!).dy;
    events.add(
      RealtimeEvent('group:message', {
        'message': {
          ...message('n1', body: 'a new one\nwith two lines', minutes: 90)
              .toJson(),
        },
      }),
    );
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(
        tester.getTopLeft(watched).dy,
        closeTo(before, 0.5),
        reason: 'frame $i',
      );
    }
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });
}
