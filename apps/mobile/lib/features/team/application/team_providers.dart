import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart'
    show caseWorkspaceClientProvider;
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/data/seat_limit_repository.dart';
import 'package:lawbid/features/team/data/team_repository.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

Duration? _noRetry(int retryCount, Object error) => null;

final teamRepositoryProvider = Provider<TeamRepository>(
  (ref) => ApiTeamRepository(
    ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

/// OQ-048: the signed-in user is an attorney's assistant (their own role).
final isAssistantProvider = Provider<bool>(
  (ref) => ref.watch(currentUserRoleProvider) == UserRole.assistant,
);

/// `GET /assistants/me` — only for assistants; [AssistantMe.none] for
/// everyone else (no request).
final assistantMeProvider =
    AsyncNotifierProvider<AssistantMeController, AssistantMe>(
  AssistantMeController.new,
  retry: _noRetry,
);

class AssistantMeController extends AsyncNotifier<AssistantMe> {
  @override
  Future<AssistantMe> build() async {
    if (!ref.watch(isAssistantProvider)) return AssistantMe.none;
    return ref.watch(teamRepositoryProvider).assistantMe();
  }

  void apply(AssistantMe me) => state = AsyncData(me);

  Future<void> refresh() async {
    if (!ref.read(isAssistantProvider)) return;
    final next = await AsyncValue.guard(
      () => ref.read(teamRepositoryProvider).assistantMe(),
    );
    if (ref.mounted) state = next;
  }
}

/// The assistant's live membership (null for non-assistants / not joined).
final activeAssistantProvider = Provider<AssistantMe?>((ref) {
  final me = ref.watch(assistantMeProvider).value;
  return (me?.active ?? false) ? me : null;
});

/// OQ-048: the attorney's app is shown — to the attorney and to an
/// assistant working in their account.
final actsAsAttorneyProvider = Provider<bool>((ref) {
  final role = ref.watch(currentUserRoleProvider);
  if (role == UserRole.attorney) return true;
  return role == UserRole.assistant &&
      ref.watch(activeAssistantProvider) != null;
});

/// The assistant holds `duty` (always true for the attorney).
final canDoProvider = Provider.family<bool, AssistantDuty>((ref, duty) {
  if (!ref.watch(isAssistantProvider)) return true;
  return ref.watch(activeAssistantProvider)?.can(duty) ?? false;
});

// --- Team (attorney) ------------------------------------------------------

final teamProvider =
    AsyncNotifierProvider.autoDispose<TeamController, TeamInfo>(
  TeamController.new,
  retry: _noRetry,
);

class TeamController extends AsyncNotifier<TeamInfo> {
  TeamRepository get _repo => ref.read(teamRepositoryProvider);

  @override
  Future<TeamInfo> build() => ref.watch(teamRepositoryProvider).team();

  Future<void> refresh() async {
    final next = await AsyncValue.guard(_repo.team);
    if (ref.mounted) state = next;
  }

  Future<void> _apply(Future<TeamInfo> Function() run) async {
    final next = await run();
    if (ref.mounted) state = AsyncData(next);
  }

  /// Owner 2026-10-04: a new seat with its one-time code; returns the
  /// added member (the code is on it).
  Future<TeamMember?> add({
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  }) async {
    final before = state.value?.members.map((m) => m.id).toSet() ?? {};
    final next = await _repo.addAssistant(
      name: name,
      duties: duties,
      acceptLiability: acceptLiability,
    );
    if (ref.mounted) state = AsyncData(next);
    return next.members.where((m) => !before.contains(m.id)).firstOrNull;
  }

  Future<void> newCode(String id) => _apply(() => _repo.regenerateCode(id));

  Future<void> setDuties(
    String id,
    Set<AssistantDuty> duties, {
    bool acceptLiability = false,
  }) =>
      _apply(
        () => _repo.updateAssistant(
          id,
          duties: duties,
          acceptLiability: acceptLiability,
        ),
      );

  Future<void> rename(String id, String name) =>
      _apply(() => _repo.updateAssistant(id, name: name));

  Future<void> remove(String id) => _apply(() => _repo.removeAssistant(id));
}

/// Team → Activity (hidden from assistants).
final teamActivityProvider = AsyncNotifierProvider.autoDispose<
    TeamActivityNotifier, PaginatedList<ActivityEntry>>(
  TeamActivityNotifier.new,
  retry: _noRetry,
);

class TeamActivityNotifier extends PagedNotifier<ActivityEntry> {
  @override
  Future<CursorPage<ActivityEntry>> fetch(String? cursor) =>
      ref.read(teamRepositoryProvider).activity(cursor: cursor);

  @override
  Object idOf(ActivityEntry item) => item.id;
}

/// Approval requests: the attorney sees all, an assistant their own.
final teamRequestsProvider = AsyncNotifierProvider.autoDispose<
    TeamRequestsNotifier, PaginatedList<AssistantRequest>>(
  TeamRequestsNotifier.new,
  retry: _noRetry,
);

class TeamRequestsNotifier extends PagedNotifier<AssistantRequest> {
  @override
  Future<CursorPage<AssistantRequest>> fetch(String? cursor) =>
      ref.read(teamRepositoryProvider).requests(cursor: cursor);

  @override
  Object idOf(AssistantRequest item) => item.id;

  /// Approve / reject in place (the row shows the decision).
  Future<void> decide(String id, {required bool approve, String? note}) async {
    final repo = ref.read(teamRepositoryProvider);
    final updated = approve
        ? await repo.approve(id, note: note)
        : await repo.reject(id, note: note);
    final current = state.value;
    if (current == null || !ref.mounted) return;
    state = AsyncData(
      PaginatedList(
        items: [
          // ignore: prefer_if_elements_to_conditional_expressions
          for (final r in current.items) r.id == id ? updated : r,
        ],
        nextCursor: current.nextCursor,
      ),
    );
    ref.invalidate(pendingRequestsCountProvider);
  }
}

/// The badge on Inbox → Team.
final pendingRequestsCountProvider =
    FutureProvider.autoDispose<int>((ref) async {
  if (!ref.watch(actsAsAttorneyProvider) || ref.watch(isAssistantProvider)) {
    return 0;
  }
  final page = await ref
      .watch(teamRepositoryProvider)
      .requests(status: RequestStatus.pending);
  return page.items.length;
});

// --- Tasks ----------------------------------------------------------------

/// Owner 2026-10-15: the tasks of the cases in work (open ones, or the
/// finished ones for the archive), as board cards. They arrive on their own,
/// after the planner's; a failure shows nothing instead of hiding the planner.
final taskBoardProvider =
    FutureProvider.autoDispose.family<List<TaskItem>, bool>(
  (ref, done) async {
    try {
      final res = await ref.watch(caseWorkspaceClientProvider).caseTaskBoard();
      return [
        for (final t in res.data)
          if ((t.status == api.BoardCaseTaskDtoStatus.done) == done)
            ApiTeamRepository.boardTask(t),
      ];
    } on Object {
      return const <TaskItem>[];
    }
  },
  retry: _noRetry,
);

/// The planner's list with the board's cards in it, in due order. What the
/// Tasks tab shows; the controller below stays the planner's own.
final mergedTasksProvider = Provider.autoDispose
    .family<AsyncValue<List<TaskItem>>, TasksKey>((ref, key) {
  final own = ref.watch(tasksProvider(key));
  if (key.mine) return own;
  final board = ref.watch(taskBoardProvider(key.done)).value;
  if (board == null || board.isEmpty) return own;
  return own.whenData((list) {
    final all = [...list, ...board];
    int cmp(TaskItem a, TaskItem b) {
      final x = key.done ? b.doneAt : a.nextDueAt;
      final y = key.done ? a.doneAt : b.nextDueAt;
      if (x == null || y == null) return x == y ? 0 : (x == null ? 1 : -1);
      return x.compareTo(y);
    }

    return all..sort(cmp);
  });
});

/// Active (calendar) or done tasks; `mine` = an assistant's Results.
typedef TasksKey = ({bool done, bool mine});

final tasksProvider = AsyncNotifierProvider.autoDispose
    .family<TasksController, List<TaskItem>, TasksKey>(
  TasksController.new,
  retry: _noRetry,
);

/// Owner 2026-10-22 (delta audit D-P3, Telegram): every live planner list,
/// so one answer of mine (a status, a step, a move, a delete) is placed in
/// all the lists that show the task (no list is read again for it), and
/// anything the phone cannot place is one `?updatedSince` per list.
class TasksHub {
  final _lists = <TasksController>{};

  void _add(TasksController c) => _lists.add(c);
  void _remove(TasksController c) => _lists.remove(c);

  /// The server's copy of [task] goes into every list: it replaces its
  /// row, enters (when it belongs), or leaves (moved to the other view).
  void apply(TaskItem task) {
    for (final c in [..._lists]) {
      c.applyTask(task);
    }
  }

  /// A task I deleted leaves every list.
  void drop(String id) {
    for (final c in [..._lists]) {
      c.dropTask(id);
    }
  }

  /// Something changed that the phone cannot place (a bulk action, a new
  /// task from another screen): one small request per live list.
  void catchUp() {
    for (final c in [..._lists]) {
      c.catchUp();
    }
  }
}

final tasksHubProvider = Provider<TasksHub>((ref) => TasksHub());

class TasksController extends AsyncNotifier<List<TaskItem>> {
  TasksController(this.key);

  final TasksKey key;

  /// The phone's clock may run ahead of the server's: a full read counts as
  /// caught up to «now» less this margin.
  static const _skew = Duration(minutes: 2);
  static const _catchUpDelay = Duration(milliseconds: 600);

  DateTime? _syncedAt;
  Timer? _timer;
  bool _pulling = false;

  @override
  Future<List<TaskItem>> build() async {
    final hub = ref.read(tasksHubProvider).._add(this);
    ref.onDispose(() {
      hub._remove(this);
      _timer?.cancel();
    });
    final repo = ref.watch(teamRepositoryProvider);
    final list = await repo.tasks(done: key.done, mine: key.mine);
    _syncedAt = DateTime.now().subtract(_skew);
    return list;
  }

  /// A full read: the user pulled to refresh.
  Future<void> refresh() async {
    final next = await AsyncValue.guard(
      () => ref
          .read(teamRepositoryProvider)
          .tasks(done: key.done, mine: key.mine),
    );
    if (ref.mounted) {
      state = next;
      if (next.hasValue) _syncedAt = DateTime.now().subtract(_skew);
    }
    if (!key.mine) ref.invalidate(taskBoardProvider(key.done));
  }

  /// One `updatedSince` request for what changed (debounced: a burst of
  /// changes is one request). A repository without deltas reads the list.
  void catchUp() {
    _timer?.cancel();
    _timer = Timer(_catchUpDelay, () {
      if (ref.mounted) unawaited(_pull());
    });
  }

  Future<void> _pull() async {
    if (_pulling) {
      catchUp();
      return;
    }
    final repo = ref.read(teamRepositoryProvider);
    final since = _syncedAt;
    if (state.value == null) return;
    if (repo is! TeamTasksSync || since == null) {
      await refresh();
      return;
    }
    _pulling = true;
    try {
      final page = await (repo as TeamTasksSync)
          .tasksChangedSince(since, done: key.done, mine: key.mine);
      if (!ref.mounted) return;
      final current = state.value ?? const <TaskItem>[];
      final deleted = page.deletedIds.toSet();
      final byId = {for (final t in page.items) t.id: t};
      state = AsyncData(
        _sorted([
          for (final t in current)
            if (!deleted.contains(t.id)) byId.remove(t.id) ?? t,
          ...byId.values,
        ]),
      );
      _syncedAt = page.syncedAt ?? since;
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.syncTooOld) {
        await refresh();
      } else {
        debugPrint('tasks catch-up: $e');
      }
    } on Object catch (e) {
      // Offline / 5xx: the next resume or reconnect asks again.
      debugPrint('tasks catch-up: $e');
    } finally {
      _pulling = false;
    }
  }

  /// The server's order of the list: the calendar (due, then created) for
  /// the active view, the newest archived first for the archive.
  List<TaskItem> _sorted(List<TaskItem> list) {
    int due(TaskItem a, TaskItem b) {
      final x = a.dueAt;
      final y = b.dueAt;
      if (x == null || y == null) return x == y ? 0 : (x == null ? 1 : -1);
      return x.compareTo(y);
    }

    int newestFirst(DateTime? x, DateTime? y) {
      if (x == null || y == null) return x == y ? 0 : (x == null ? 1 : -1);
      return y.compareTo(x);
    }

    return [...list]..sort(
        key.done
            ? (a, b) {
                final c = newestFirst(a.archivedAt, b.archivedAt);
                return c != 0 ? c : b.createdAt.compareTo(a.createdAt);
              }
            : (a, b) {
                final c = due(a, b);
                return c != 0 ? c : a.createdAt.compareTo(b.createdAt);
              },
      );
  }

  /// Puts the server's copy of [task] into this list: its row is replaced,
  /// it enters when it belongs here, it leaves when it moved to the other
  /// view (active / archive). An assistant's Results list only edits rows
  /// it already holds.
  void applyTask(TaskItem task) {
    final current = state.value;
    if (!ref.mounted || current == null) return;
    final keep = key.done ? task.archived : !task.archived;
    final had = current.any((t) => t.id == task.id);
    if (!had && (!keep || key.mine)) return;
    state = AsyncData(
      had
          ? [
              for (final t in current)
                if (t.id != task.id) t else if (keep) task,
            ]
          : _sorted([...current, task]),
    );
  }

  void dropTask(String id) {
    final current = state.value;
    if (!ref.mounted || current == null) return;
    if (!current.any((t) => t.id == id)) return;
    state = AsyncData([
      for (final t in current)
        if (t.id != id) t,
    ]);
  }

  /// Applies a status change; a failure keeps the row. The answered copy
  /// goes into every list (it may move to the other view).
  Future<TaskItem> setStatus(
    TaskItem task,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  }) async {
    final updated = await ref.read(teamRepositoryProvider).setTaskStatus(
          task.id,
          status,
          note: note,
          rescheduleTo: rescheduleTo,
        );
    ref.read(tasksHubProvider).apply(updated);
    return updated;
  }

  /// Owner 2026-10-01: puts the server's copy of [updated] into the lists
  /// (it moves to Done when its last step was checked).
  void _put(TaskItem updated) => ref.read(tasksHubProvider).apply(updated);

  /// A step's checkmark — instant locally, then the server's answer.
  Future<TaskItem> checkStep(
    TaskItem task,
    TaskStep step,
    TaskStatus status, {
    String? note,
  }) async {
    final before = state.value;
    if (ref.mounted && before != null) {
      state = AsyncData([
        for (final t in before)
          // ignore: prefer_if_elements_to_conditional_expressions
          t.id != task.id
              ? t
              : t.withSteps([
                  for (final s in t.steps)
                    // ignore: prefer_if_elements_to_conditional_expressions
                    s.id != step.id
                        ? s
                        : TaskStep(
                            id: s.id,
                            title: s.title,
                            status: status,
                            kind: s.kind,
                            dueAt: s.dueAt,
                            location: s.location,
                            contactName: s.contactName,
                            contactPhone: s.contactPhone,
                            contactEmail: s.contactEmail,
                            note: note ?? s.note,
                            doneAt: DateTime.now(),
                            createdByName: s.createdByName,
                          ),
                ]),
      ]);
    }
    try {
      final updated = await ref
          .read(teamRepositoryProvider)
          .updateTaskStep(task.id, step.id, status: status, note: note);
      _put(updated);
      return updated;
    } on Object {
      if (ref.mounted && before != null) state = AsyncData(before);
      rethrow;
    }
  }

  /// "Not done — move it": one request — the step stays open at the new
  /// time with the note (no "task failed" in between).
  Future<TaskItem> rescheduleStep(
    TaskItem task,
    TaskStep step,
    DateTime to, {
    String? note,
  }) async {
    final updated = await ref.read(teamRepositoryProvider).updateTaskStep(
          task.id,
          step.id,
          status: TaskStatus.open,
          note: note,
          dueAt: to,
        );
    _put(updated);
    return updated;
  }

  Future<TaskItem> moveStep(TaskItem task, TaskStep step, DateTime to) async {
    final updated = await ref
        .read(teamRepositoryProvider)
        .updateTaskStep(task.id, step.id, dueAt: to);
    _put(updated);
    return updated;
  }

  Future<TaskItem> addStep(TaskItem task, TaskStepDraft draft) async {
    final updated =
        await ref.read(teamRepositoryProvider).addTaskStep(task.id, draft);
    _put(updated);
    return updated;
  }

  Future<TaskItem> removeStep(TaskItem task, TaskStep step) async {
    final updated =
        await ref.read(teamRepositoryProvider).removeTaskStep(task.id, step.id);
    _put(updated);
    return updated;
  }
}

/// Owner 2026-10-05: the same action on many tasks; every list on screen
/// then asks one `?updatedSince` (delta audit D-P3).
Future<({int affected, int skipped})> bulkTasks(
  WidgetRef ref,
  List<String> ids,
  TaskBulkAction action, {
  TaskStatus? status,
  TaskPriority? priority,
  String? assigneeMembershipId,
}) async {
  final r = await ref.read(teamRepositoryProvider).bulkTasks(
        ids,
        action,
        status: status,
        priority: priority,
        assigneeMembershipId: assigneeMembershipId,
      );
  syncAllTasks(ref);
  return r;
}

/// A change the phone cannot place on its own: every task list on screen
/// asks one small `?updatedSince`. [board] also reads the cases' board
/// again (it has no delta) — only for an action that touches a case task.
void syncAllTasks(WidgetRef ref, {bool board = false}) {
  ref.read(tasksHubProvider).catchUp();
  if (board) {
    for (final done in [false, true]) {
      ref.invalidate(taskBoardProvider(done));
    }
  }
}

/// Owner 2026-10-05: people to add (team, chats, contacts; attorneys by
/// name when searching).
final taskPeopleProvider =
    FutureProvider.autoDispose.family<List<TaskPersonSuggestion>, String>(
  (ref, q) => ref.watch(teamRepositoryProvider).taskPeople(q),
  retry: _noRetry,
);

// --- Seat limit (owner 2026-10-05) ----------------------------------------

final seatLimitRepositoryProvider = Provider<SeatLimitRepository>(
  (ref) => ApiSeatLimitRepository(ref.watch(dioProvider)),
);

/// The attorney's assistant limit and their latest request for more.
final seatLimitProvider = FutureProvider.autoDispose<SeatLimitState>(
  (ref) => ref.watch(seatLimitRepositoryProvider).state(),
);
