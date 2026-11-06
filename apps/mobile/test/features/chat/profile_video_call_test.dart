import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/profile_video_call.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../../helpers/ux_harness.dart';

Conversation _conv({
  bool direct = true,
  bool unlocked = true,
  bool closed = false,
}) =>
    Conversation(
      id: 'c1',
      caseId: direct ? null : 'k1',
      caseTitle: null,
      status: closed ? ConversationStatus.closed : ConversationStatus.active,
      contactsUnlocked: unlocked,
      counterpart: const Counterpart(
        isAttorney: true,
        verified: true,
        id: 'u2',
        displayName: 'Anna Kowalski',
        username: 'anna',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
    );

/// R-012: the profile's video button follows the chat header's rules.
void main() {
  Future<void> pump(
    WidgetTester tester, {
    Conversation? saved,
    bool video = true,
    bool callsDuty = true,
    Set<String> blocked = const {},
  }) async {
    final overrides = <Override>[
      ...uxOverrides(),
      videoCallsEnabledProvider.overrideWithValue(video),
      savedDirectChatProvider.overrideWith((ref, id) async => saved),
      blockedIdsProvider.overrideWith((ref) async => blocked),
      canDoProvider.overrideWith((ref, duty) => callsDuty),
    ];
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: ProfileVideoCallButton(
              userId: 'u2',
              builder: (label, onTap) => TextButton(
                key: const ValueKey('video'),
                onPressed: onTap,
                child: Text(label),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  final button = find.byKey(const ValueKey('video'));

  testWidgets('shown for an open direct chat with video calls on',
      (tester) async {
    await pump(tester, saved: _conv());
    expect(button, findsOneWidget);
  });

  testWidgets('hidden without a saved chat (no server request is made)',
      (tester) async {
    await pump(tester);
    expect(button, findsNothing);
  });

  testWidgets('hidden whenever the chat header hides the call buttons',
      (tester) async {
    await pump(tester, saved: _conv(), video: false);
    expect(button, findsNothing, reason: 'video_calls switch off');
    await pump(tester, saved: _conv(unlocked: false));
    expect(button, findsNothing, reason: 'request not accepted yet');
    await pump(tester, saved: _conv(closed: true));
    expect(button, findsNothing, reason: 'closed chat');
    await pump(tester, saved: _conv(), callsDuty: false);
    expect(button, findsNothing, reason: 'assistant without the calls duty');
    await pump(tester, saved: _conv(), blocked: {'u2'});
    expect(button, findsNothing, reason: 'blocked');
  });
}
