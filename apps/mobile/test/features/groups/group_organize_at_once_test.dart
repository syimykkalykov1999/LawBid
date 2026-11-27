import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'fake_group_repository.dart';

/// Owner 26.11 (Telegram, WhatsApp): my own pin / mute / archive / delete
/// of a group shows in the chats list at once, before the server answers;
/// a refusal puts the list back as it was.
class _HeldGroups extends FakeGroupRepository {
  _HeldGroups(super.items);

  Completer<api.GroupDto>? answer;
  int writes = 0;

  @override
  Future<api.GroupDto> updateMine(String id, api.UpdateGroupMeDto body) {
    writes++;
    return answer!.future;
  }
}

void main() {
  late _HeldGroups repo;
  late ProviderContainer c;
  late WidgetRef ref;

  Future<void> boot(WidgetTester tester) async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    final events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
    final cache = CacheDatabase(NativeDatabase.memory());
    final social = SocialLocalDatabase(NativeDatabase.memory());
    repo = _HeldGroups([listGroup('g1'), listGroup('g2')]);
    c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        groupsEnabledProvider.overrideWithValue(true),
        realtimeClientProvider.overrideWithValue(null),
        realtimeEventsProvider.overrideWithValue(events.stream),
        currentUserIdProvider.overrideWithValue('u1'),
        cacheDatabaseProvider.overrideWithValue(cache),
        socialLocalDatabaseProvider.overrideWithValue(social),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await cache.close();
      await social.close();
    });
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: Consumer(
          builder: (context, r, _) {
            ref = r;
            r.watch(groupsProvider);
            return const SizedBox();
          },
        ),
      ),
    );
    await tester.runAsync(() => c.read(groupsProvider.future));
    await tester.pump();
  }

  List<api.GroupDto> rows() => c.read(groupsProvider).requireValue.items;
  api.GroupDto row(String id) => rows().firstWhere((g) => g.id == id);
  api.GroupDto answered(String id, Map<String, Object?> change) =>
      api.GroupDto.fromJson({...row(id).toJson(), ...change});

  testWidgets('a pin moves the group up before the answer', (tester) async {
    await boot(tester);
    final last = rows().last.id;
    repo.answer = Completer<api.GroupDto>();
    final pending = updateMyGroup(ref, last, pinned: true);
    expect(rows().first.id, last);
    expect(row(last).pinned, isTrue);
    repo.answer!.complete(answered(last, {'pinned': true}));
    await tester.runAsync(() => pending);
    expect(row(last).pinned, isTrue);
    expect(repo.writes, 1);
  });

  testWidgets('a refused mute puts the row back and rethrows', (tester) async {
    await boot(tester);
    final before = rows().map((g) => g.id).toList();
    repo.answer = Completer<api.GroupDto>();
    final pending = updateMyGroup(ref, 'g1', muted: true);
    expect(isGroupMuted(row('g1')), isTrue);
    repo.answer!.completeError(
      const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
    );
    Object? error;
    await tester.runAsync(() async {
      try {
        await pending;
      } on Object catch (e) {
        error = e;
      }
    });
    expect(error, isA<ApiException>());
    expect(isGroupMuted(row('g1')), isFalse);
    expect(rows().map((g) => g.id).toSet(), before.toSet());
  });

  testWidgets('delete: the group leaves at once, back on a refusal',
      (tester) async {
    await boot(tester);
    repo.answer = Completer<api.GroupDto>();
    final pending = updateMyGroup(ref, 'g1', hidden: true);
    expect(rows().map((g) => g.id), isNot(contains('g1')));
    repo.answer!.completeError(
      const ApiException(code: ApiErrorCodes.internalError, message: 'x'),
    );
    await tester.runAsync(() async {
      try {
        await pending;
      } on Object {
        // expected
      }
    });
    expect(rows().map((g) => g.id), contains('g1'));
  });
}
