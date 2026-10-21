import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/notifications/application/call_mute.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';

/// Owner 2026-10-21: an incoming call must not ring when «Calls» is off in
/// Settings, or when the calls of that chat / group are muted.
void main() {
  final probe =
      Provider.autoDispose.family<bool, ({String? chat, String? group})>(
    (ref, k) => callRingMuted(ref, conversationId: k.chat, groupId: k.group),
  );

  ProviderContainer make({Set<NotifCategory> muted = const {}}) {
    final c = ProviderContainer(
      overrides: [
        mutedCategoriesProvider.overrideWith((ref) async => muted),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  test('rings when nothing is muted', () async {
    final c = make();
    await c.read(mutedCategoriesProvider.future);
    expect(c.read(probe((chat: 'c1', group: null))), isFalse);
  });

  test('«Calls» off silences every call', () async {
    final c = make(muted: {NotifCategory.calls});
    await c.read(mutedCategoriesProvider.future);
    expect(c.read(probe((chat: 'c1', group: null))), isTrue);
    expect(c.read(probe((chat: null, group: 'g1'))), isTrue);
  });

  test('a muted chat or group is silent, the others still ring', () async {
    final c = make();
    await c.read(mutedCategoriesProvider.future);
    c.read(callMutedChatsProvider.notifier)
      ..mark('c1', muted: true)
      ..mark('g1', muted: true);
    expect(c.read(probe((chat: 'c1', group: null))), isTrue);
    expect(c.read(probe((chat: null, group: 'g1'))), isTrue);
    expect(c.read(probe((chat: 'c2', group: null))), isFalse);
    c.read(callMutedChatsProvider.notifier).mark('g1', muted: false);
    c.invalidate(probe);
    expect(c.read(probe((chat: null, group: 'g1'))), isFalse);
  });
}
