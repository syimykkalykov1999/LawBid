import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncedPage;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/data/team_repository.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

import 'team_fakes.dart';

/// Owner 2026-10-22 (delta audit D-P3, Telegram): my own answer is placed in
/// the lists (0 requests); anything else is one small `updatedSince`, never
/// the whole planner again.
class _SyncRepo extends FakeTeamRepository implements TeamTasksSync {
  SyncedPage<TaskItem> changed = const SyncedPage(items: []);
  int fullReads = 0;
  int deltaReads = 0;

  @override
  Future<List<TaskItem>> tasks({bool done = false, bool mine = false}) {
    fullReads++;
    return super.tasks(done: done, mine: mine);
  }

  @override
  Future<SyncedPage<TaskItem>> tasksChangedSince(
    DateTime since, {
    bool done = false,
    bool mine = false,
  }) async {
    deltaReads++;
    return changed;
  }

  TaskItem? statusAnswer;

  @override
  Future<TaskItem> setTaskStatus(
    String id,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  }) async =>
      statusAnswer ?? await super.task(id);
}

void main() {
  const open = (done: false, mine: false);
  const done = (done: true, mine: false);

  ProviderContainer boot(_SyncRepo repo) {
    final c = ProviderContainer(
      overrides: [teamRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(c.dispose);
    return c;
  }

  Future<void> wait() => Future<void>.delayed(
        const Duration(milliseconds: 900),
      );

  test('a done answer moves the task to the archive list, 0 requests',
      () async {
    final repo = _SyncRepo()
      ..active = [makeTask('a'), makeTask('b')]
      ..done = [];
    final c = boot(repo);
    final s1 = c.listen(tasksProvider(open), (_, __) {});
    final s2 = c.listen(tasksProvider(done), (_, __) {});
    addTearDown(s1.close);
    addTearDown(s2.close);
    await c.read(tasksProvider(open).future);
    await c.read(tasksProvider(done).future);
    expect(repo.fullReads, 2);

    repo.statusAnswer = makeTask('a', status: TaskStatus.done);
    await c.read(tasksProvider(open).notifier).setStatus(
          makeTask('a'),
          TaskStatus.done,
        );

    expect(c.read(tasksProvider(open)).value!.map((t) => t.id), ['b']);
    expect(c.read(tasksProvider(done)).value!.map((t) => t.id), ['a']);
    expect(repo.fullReads, 2, reason: 'no list was read again');
    expect(repo.deltaReads, 0);
  });

  test('a burst of catch-ups is one small request per list, merged by id',
      () async {
    final repo = _SyncRepo()..active = [makeTask('a'), makeTask('b')];
    final c = boot(repo);
    final sub = c.listen(tasksProvider(open), (_, __) {});
    addTearDown(sub.close);
    await c.read(tasksProvider(open).future);

    repo.changed = SyncedPage(
      items: [makeTask('b', note: 'changed'), makeTask('c')],
      deletedIds: const ['a'],
      syncedAt: DateTime.utc(2026, 10, 22, 12),
    );
    final hub = c.read(tasksHubProvider);
    for (var i = 0; i < 5; i++) {
      hub.catchUp();
    }
    await wait();

    expect(repo.deltaReads, 1);
    expect(repo.fullReads, 1);
    final ids = c.read(tasksProvider(open)).value!.map((t) => t.id).toSet();
    expect(ids, {'b', 'c'});
    final b = c.read(tasksProvider(open)).value!.firstWhere((t) => t.id == 'b');
    expect(b.outcomeNote, 'changed');
  });

  test('a deleted task leaves every list, 0 requests', () async {
    final repo = _SyncRepo()
      ..active = [makeTask('a'), makeTask('b')]
      ..done = [makeTask('d', status: TaskStatus.done)];
    final c = boot(repo);
    final s1 = c.listen(tasksProvider(open), (_, __) {});
    final s2 = c.listen(tasksProvider(done), (_, __) {});
    addTearDown(s1.close);
    addTearDown(s2.close);
    await c.read(tasksProvider(open).future);
    await c.read(tasksProvider(done).future);

    c.read(tasksHubProvider).drop('a');
    expect(c.read(tasksProvider(open)).value!.map((t) => t.id), ['b']);
    expect(repo.fullReads + repo.deltaReads, 2);
  });

  test('a repository without deltas reads the list instead', () async {
    final repo = FakeTeamRepository()..active = [makeTask('a')];
    final c = ProviderContainer(
      overrides: [teamRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(c.dispose);
    final sub = c.listen(tasksProvider(open), (_, __) {});
    addTearDown(sub.close);
    await c.read(tasksProvider(open).future);
    repo.active = [makeTask('a'), makeTask('z')];
    c.read(tasksHubProvider).catchUp();
    await wait();
    expect(c.read(tasksProvider(open)).value!.map((t) => t.id), ['a', 'z']);
  });

  test('a new task from another screen enters the active list in due order',
      () async {
    final now = DateTime.now();
    final repo = _SyncRepo()
      ..active = [
        makeTask('late', dueAt: now.add(const Duration(days: 3))),
        makeTask('none'),
      ];
    final c = boot(repo);
    final sub = c.listen(tasksProvider(open), (_, __) {});
    addTearDown(sub.close);
    await c.read(tasksProvider(open).future);

    c.read(tasksHubProvider).apply(
          makeTask('soon', dueAt: now.add(const Duration(hours: 2))),
        );
    expect(
      c.read(tasksProvider(open)).value!.map((t) => t.id),
      ['soon', 'late', 'none'],
    );
    expect(repo.fullReads, 1);
  });
}
