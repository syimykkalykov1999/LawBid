import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/upload_queue_overrides.dart';
import 'fake_group_repository.dart';

/// A send that answers only when [gate] completes.
class _SlowRepo extends FakeGroupRepository {
  Completer<void>? gate;

  @override
  Future<api.GroupMessageDto> send(
    String id,
    api.SendGroupMessageDto body,
  ) async {
    await gate?.future;
    return super.send(id, body);
  }
}

/// ROUND1 25.11 row 16 (the 1:1 chat keeps an unsent message in its
/// outbox): a group message written without the network vanished when the
/// group was left — its pending row lived only in the auto-disposed thread,
/// and a send that ended after the leave was swallowed (`ref.mounted`).
/// Now it is still there, «Not sent» with Retry, when the group opens again.
void main() {
  const key = (groupId: 'g1', topicId: null);

  ProviderContainer container(
    FakeGroupRepository repo, {
    SharedPreferences? prefs,
  }) {
    final c = ProviderContainer(
      overrides: [
        if (prefs != null) ...[
          sharedPreferencesProvider.overrideWithValue(prefs),
          currentUserIdProvider.overrideWithValue('me'),
        ],
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        ...uploadQueueOverrides(uploader: FakeStorageUploader()),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 80));

  test('a message refused offline is still there after leaving the group',
      () async {
    final repo = _SlowRepo()
      ..refuseSend = const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
    final c = container(repo);
    var sub = c.listen(groupThreadProvider(key), (_, __) {});
    await settle();
    await c.read(groupThreadProvider(key).notifier).sendText('Are you there?');
    expect(c.read(groupThreadProvider(key)).pending.single.failed, isTrue);

    sub.close(); // the group is left: the thread is disposed
    await settle();
    sub = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(sub.close);
    final back = c.read(groupThreadProvider(key)).pending;
    expect(back.map((p) => p.body), ['Are you there?']);
    expect(back.single.failed, isTrue, reason: '«Not sent» with Retry');

    repo.refuseSend = null;
    await c.read(groupThreadProvider(key).notifier).retry(
          back.single.clientMessageId,
        );
    expect(repo.sentBodies.single.body, 'Are you there?');
    expect(c.read(groupThreadProvider(key)).pending, isEmpty);
  });

  test('a send that fails after the group was left is not lost', () async {
    final repo = _SlowRepo()..gate = Completer<void>();
    final c = container(repo);
    var sub = c.listen(groupThreadProvider(key), (_, __) {});
    await settle();
    unawaited(
      c.read(groupThreadProvider(key).notifier).sendText('On my way'),
    );
    sub.close(); // left while the request still runs
    await settle();

    repo.refuseSend = const ApiException(
      code: ApiException.networkErrorCode,
      message: 'offline',
    );
    repo.gate!.complete();
    await settle();

    sub = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(sub.close);
    final back = c.read(groupThreadProvider(key)).pending;
    expect(back.map((p) => p.body), ['On my way']);
    expect(back.single.failed, isTrue);
  });

  test('a send that succeeds after the group was left leaves no row behind',
      () async {
    final repo = _SlowRepo()..gate = Completer<void>();
    final c = container(repo);
    var sub = c.listen(groupThreadProvider(key), (_, __) {});
    await settle();
    unawaited(
      c.read(groupThreadProvider(key).notifier).sendText('Sent later'),
    );
    sub.close();
    await settle();
    repo.gate!.complete();
    await settle();
    expect(repo.sentBodies.single.body, 'Sent later');

    sub = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(sub.close);
    expect(c.read(groupThreadProvider(key)).pending, isEmpty);
  });

  // H3 (ARCHITECTURE_VS_BIG_PLATFORMS 25.11, the 1:1 outbox): the rows are
  // on the device — killed while sending, the message goes out by itself
  // when the group opens again; a refused one is still «Not sent».
  test('the app killed while sending: the message goes out after the restart',
      () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final dead = _SlowRepo()..gate = Completer<void>();
    final first = container(dead, prefs: prefs);
    final sub = first.listen(groupThreadProvider(key), (_, __) {});
    await settle();
    unawaited(
      first.read(groupThreadProvider(key).notifier).sendText('Before the kill'),
    );
    await settle();
    sub.close();
    // «Kill»: a new app over the same device storage; this request never
    // answers.

    final repo = _SlowRepo();
    final c = container(repo, prefs: prefs);
    final again = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(again.close);
    await settle();
    expect(repo.sentBodies.map((b) => b.body), ['Before the kill']);
    expect(c.read(groupThreadProvider(key)).pending, isEmpty);
  });

  test('a refused message is still «Not sent» after a restart', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final offline = _SlowRepo()
      ..refuseSend = const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
    final first = container(offline, prefs: prefs);
    final sub = first.listen(groupThreadProvider(key), (_, __) {});
    await settle();
    await first.read(groupThreadProvider(key).notifier).sendText('Offline');
    sub.close();
    // «Kill»: a new app over the same device storage.

    final repo = _SlowRepo();
    final c = container(repo, prefs: prefs);
    final again = c.listen(groupThreadProvider(key), (_, __) {});
    addTearDown(again.close);
    await settle();
    final back = c.read(groupThreadProvider(key)).pending;
    expect(back.map((p) => p.body), ['Offline']);
    expect(back.single.failed, isTrue);
    expect(repo.sentBodies, isEmpty, reason: 'only Retry sends it');
  });
}
