import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/blocks/data/blocks_repository.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

class _Blocks implements BlocksRepository {
  final blocked = <String>[];
  final unblocked = <String>[];

  @override
  Future<List<BlockedUser>> list() async => const [];

  @override
  Future<void> block(String userId) async => blocked.add(userId);

  /// A real request outlives the sheet's 250 ms slide-out.
  @override
  Future<void> unblock(String userId) async {
    await Future<void>.delayed(const Duration(seconds: 1));
    unblocked.add(userId);
  }
}

/// Round 1 app check 25.11 №1: «⋯» on someone's profile → «Block» did not
/// block. The row closed its sheet, then read providers through its own
/// `ref` — disposed with the sheet by the time the confirmation answered
/// (Riverpod 3 throws «Cannot use ref after the widget was disposed»), so
/// the block never reached the server and an error showed instead;
/// «Unblock» reached it but still showed the error.
void main() {
  Future<_Blocks> pump(
    WidgetTester tester, {
    required bool blocked,
    required void Function() onChanged,
  }) async {
    final repo = _Blocks();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          blocksRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showAppBottomSheet<void>(
                  context: context,
                  builder: (_) => BlockListRow(
                    userId: 'u1',
                    displayName: 'Ann',
                    currentlyBlocked: blocked,
                    onChanged: onChanged,
                  ),
                ),
                child: const Text('more'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('more'));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('«Block» in the «⋯» sheet blocks after the confirmation',
      (tester) async {
    var changed = 0;
    final repo = await pump(tester, blocked: false, onChanged: () => changed++);
    await tester.tap(find.text('Block'));
    await tester.pumpAndSettle();
    // The sheet is gone, the confirmation sits on the screen.
    expect(find.byType(BlockListRow), findsNothing);
    await tester.tap(find.widgetWithText(TextButton, 'Block'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(repo.blocked, ['u1']);
    expect(changed, 1);
    expect(find.text('User blocked'), findsOneWidget);
  });

  testWidgets('«Unblock» unblocks and says so, no error', (tester) async {
    var changed = 0;
    final repo = await pump(tester, blocked: true, onChanged: () => changed++);
    await tester.tap(find.text('Unblock'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(repo.unblocked, ['u1']);
    expect(changed, 1);
    expect(find.text('User unblocked'), findsOneWidget);
  });
}
