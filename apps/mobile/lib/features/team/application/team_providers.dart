import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/data/team_repository.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

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

/// The assistant holds [duty] (always true for the attorney).
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

  Future<void> add(String phone, {String? name}) =>
      _apply(() => _repo.addAssistant(phone, name: name));

  Future<void> setDuties(String id, Set<AssistantDuty> duties) =>
      _apply(() => _repo.updateAssistant(id, duties: duties));

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

/// Active (calendar) or done tasks; `mine` = an assistant's Results.
typedef TasksKey = ({bool done, bool mine});

final tasksProvider = AsyncNotifierProvider.autoDispose
    .family<TasksController, List<TaskItem>, TasksKey>(
  TasksController.new,
  retry: _noRetry,
);

class TasksController extends AsyncNotifier<List<TaskItem>> {
  TasksController(this.key);

  final TasksKey key;

  @override
  Future<List<TaskItem>> build() =>
      ref.watch(teamRepositoryProvider).tasks(done: key.done, mine: key.mine);

  Future<void> refresh() async {
    final next = await AsyncValue.guard(
      () => ref
          .read(teamRepositoryProvider)
          .tasks(done: key.done, mine: key.mine),
    );
    if (ref.mounted) state = next;
  }

  /// Applies a status change locally first (the checkbox feels instant),
  /// then the server's answer; a failure restores the row.
  Future<TaskItem> setStatus(
    TaskItem task,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  }) async {
    final before = state.value;
    try {
      final updated = await ref.read(teamRepositoryProvider).setTaskStatus(
            task.id,
            status,
            note: note,
            rescheduleTo: rescheduleTo,
          );
      final current = state.value ?? const <TaskItem>[];
      final keep = key.done ? !updated.status.active : updated.status.active;
      if (ref.mounted) {
        state = AsyncData([
          for (final t in current)
            if (t.id != task.id) t else if (keep) updated,
        ]);
      }
      ref.invalidate(tasksProvider((done: !key.done, mine: key.mine)));
      return updated;
    } on Object {
      if (ref.mounted && before != null) state = AsyncData(before);
      rethrow;
    }
  }
}

/// Open tasks count for the Mine → Tasks tab badge.
final openTasksCountProvider = Provider.autoDispose<int>((ref) {
  final list = ref.watch(tasksProvider((done: false, mine: false))).value;
  return list?.length ?? 0;
});
