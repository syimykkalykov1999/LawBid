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

/// No connection after the first read: every call fails.
class _Offline extends _Server {
  bool offline = false;

  @override
  Future<PrivacySettings> settings() async {
    if (offline) throw Exception('offline');
    return super.settings();
  }

  @override
  Future<PrivacySettings> change(
    PrivacyField field,
    Audience value, {
    required bool followAudiences,
  }) async =>
      throw Exception('offline');
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

  // Final pass 18.11 (FA1): offline, the change and the read after it both
  // fail. The rows stay on screen with the old value (and the snackbar
  // says why), not a full-screen error in place of the settings.
  test('offline: a failed change keeps the rows with the old value', () async {
    final server = _Offline();
    final container = ProviderContainer(
      overrides: [privacyRepositoryProvider.overrideWithValue(server)],
    );
    addTearDown(container.dispose);
    final sub = container.listen(privacySettingsProvider, (_, __) {});
    addTearDown(sub.close);
    await container.read(privacySettingsProvider.future);
    final notifier = container.read(privacySettingsProvider.notifier);
    server.offline = true;

    await expectLater(
      notifier.change(PrivacyField.messageFrom, Audience.nobody),
      throwsException,
    );
    await expectLater(notifier.setDoNotSell(value: true), throwsException);
    await Future<void>.delayed(Duration.zero);

    final shown = container.read(privacySettingsProvider);
    expect(shown, isA<AsyncData<PrivacySettings>>());
    expect(shown.value?.messageFrom, {Audience.everyone});
    expect(shown.value?.doNotSell, isFalse);
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
