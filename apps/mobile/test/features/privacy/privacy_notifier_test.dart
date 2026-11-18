import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';

/// The server side of the screen: the last value wins; a «Last seen» change
/// waits for [lastSeenAnswer] and is refused.
class _Server implements PrivacyRepository {
  PrivacySettings stored = const PrivacySettings(
    lastSeen: {Audience.everyone},
    messageFrom: {Audience.everyone},
    callFrom: {Audience.everyone},
  );
  final lastSeenAnswer = Completer<void>();
  int reads = 0;

  @override
  Future<PrivacySettings> settings() async {
    reads++;
    return stored;
  }

  @override
  Future<PrivacySettings> change(
    PrivacyField field,
    Audience value, {
    required bool followAudiences,
  }) async {
    if (field == PrivacyField.lastSeen) {
      await lastSeenAnswer.future;
      throw Exception('refused');
    }
    return stored = stored.withField(field, {value});
  }

  @override
  Future<PrivacySettings> setDoNotSell({required bool value}) async =>
      throw Exception('refused');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  // Verify batch 7 (PS4, 2026-11-17): a refused change no longer restores
  // the snapshot taken before the tap, which dropped a newer change that
  // the server accepted meanwhile; the screen shows what the server has.
  test('a refused change keeps a newer change the server accepted', () async {
    final server = _Server();
    final container = ProviderContainer(
      overrides: [privacyRepositoryProvider.overrideWithValue(server)],
    );
    addTearDown(container.dispose);
    final sub = container.listen(privacySettingsProvider, (_, __) {});
    addTearDown(sub.close);
    await container.read(privacySettingsProvider.future);
    final notifier = container.read(privacySettingsProvider.notifier);

    // Tap 1 (slow, will be refused), then tap 2 (accepted at once).
    final first = notifier.change(PrivacyField.lastSeen, Audience.nobody);
    await notifier.change(PrivacyField.messageFrom, Audience.nobody);
    expect(
      container.read(privacySettingsProvider).value?.messageFrom,
      {Audience.nobody},
    );

    server.lastSeenAnswer.complete();
    await expectLater(first, throwsException);

    final shown = container.read(privacySettingsProvider).value;
    expect(shown?.messageFrom, {Audience.nobody});
    expect(shown?.lastSeen, {Audience.everyone});
  });

  test('a refused «Do not sell» shows the server value again', () async {
    final server = _Server();
    final container = ProviderContainer(
      overrides: [privacyRepositoryProvider.overrideWithValue(server)],
    );
    addTearDown(container.dispose);
    final sub = container.listen(privacySettingsProvider, (_, __) {});
    addTearDown(sub.close);
    await container.read(privacySettingsProvider.future);
    final notifier = container.read(privacySettingsProvider.notifier);

    await expectLater(notifier.setDoNotSell(value: true), throwsException);
    expect(container.read(privacySettingsProvider).value?.doNotSell, isFalse);
    expect(server.reads, 2);
  });
}
