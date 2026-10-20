import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/join_group_screen.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-10-20: an invite link that no longer works (the server
/// answers 404) says so once, with a way back — no endless spinner and no
/// repeated requests.
class _DeadLinkRepository extends FakeGroupRepository {
  int calls = 0;

  @override
  Future<api.GroupInvitePreviewDto> preview(String code) async {
    calls++;
    throw const ApiException(
      code: ApiErrorCodes.groupNotFound,
      message: 'Group not found',
      statusCode: 404,
    );
  }
}

void main() {
  testWidgets('a dead invite link shows the error state and asks once',
      (tester) async {
    final repo = _DeadLinkRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            groupRepositoryProvider.overrideWithValue(repo),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const JoinGroupScreen(code: 'bad-code-0123456789'),
        ),
      ),
    );
    // Long enough for any automatic retry (1 s, 2 s, 4 s...) to fire.
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byKey(const ValueKey('join-back')), findsOneWidget);
    expect(repo.calls, 1);
  });
}
