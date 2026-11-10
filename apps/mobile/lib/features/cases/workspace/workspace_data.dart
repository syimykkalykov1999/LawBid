import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/keep_alive_for.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/workspace/case_files_outbox.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialRepositoryProvider;
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-13: the case workspace's data — files, tasks, updates and
/// activity of an accepted case, for the client and the attorney alike.
Duration? _noRetry(int retryCount, Object error) => null;

final caseWorkspaceClientProvider =
    Provider<api.CasesClient>((ref) => api.CasesClient(ref.watch(dioProvider)));

final caseWorkspaceProvider =
    FutureProvider.autoDispose.family<api.CaseWorkspaceDto, String>(
  (ref, id) async {
    // R-385: kept 2 min (no realtime here; own actions invalidate).
    ref.keepAliveFor(KeepWindows.workspace);
    return (await guardApiCall(
      () => ref.watch(caseWorkspaceClientProvider).caseWorkspace(id: id),
    ))
        .data;
  },
  retry: _noRetry,
);

final caseFilesProvider =
    FutureProvider.autoDispose.family<List<api.WorkspaceFileDto>, String>(
  (ref, id) async {
    // R-385: kept 2 min (no realtime here; own actions invalidate).
    ref.keepAliveFor(KeepWindows.workspace);
    return (await guardApiCall(
      () => ref.watch(caseWorkspaceClientProvider).listCaseFiles(id: id),
    ))
        .data;
  },
  retry: _noRetry,
);

/// One Files / Photos tab of a case with its filter chip: 0 all, 1 from
/// tasks, 2 from updates, 3 samples.
typedef CaseFilesView = ({String caseId, bool media, int filter});

/// Owner 2026-11-10 (load in parts, like Telegram's shared media): a case's
/// files a page at a time, filtered by the server, the next page asked for
/// before the end of the list ([PagedNotifier]).
class CaseFilesNotifier extends PagedNotifier<api.WorkspaceFileDto> {
  CaseFilesNotifier(this.view);

  final CaseFilesView view;

  static const pageSize = 30;

  @override
  Duration? get keepAliveFor => KeepWindows.workspace;

  @override
  Object idOf(api.WorkspaceFileDto item) => item.fileId;

  @override
  Future<CursorPage<api.WorkspaceFileDto>> fetch(String? cursor) =>
      ref.read(caseFilesRemoteProvider).page(view, cursor, pageSize);
}

final caseFilesPagedProvider = AsyncNotifierProvider.autoDispose.family<
    CaseFilesNotifier, PaginatedList<api.WorkspaceFileDto>, CaseFilesView>(
  CaseFilesNotifier.new,
  retry: _noRetry,
);

/// Whether a tab has any sample (the «Samples» chip): one row is enough.
final caseFilesHaveSamplesProvider = FutureProvider.autoDispose
    .family<bool, ({String caseId, bool media})>((ref, v) async {
  ref.keepAliveFor(KeepWindows.workspace);
  return ref
      .watch(caseFilesRemoteProvider)
      .hasSamples(v.caseId, media: v.media);
});

/// The server side of [CaseFilesNotifier] (tests put their own files here).
abstract interface class CaseFilesRemote {
  Future<CursorPage<api.WorkspaceFileDto>> page(
    CaseFilesView view,
    String? cursor,
    int limit,
  );

  Future<bool> hasSamples(String caseId, {required bool media});
}

class ApiCaseFilesRemote implements CaseFilesRemote {
  const ApiCaseFilesRemote(this._client);

  final api.CasesClient _client;

  static api.CaseFilesKind _kind(bool media) =>
      media ? api.CaseFilesKind.media : api.CaseFilesKind.documents;

  @override
  Future<CursorPage<api.WorkspaceFileDto>> page(
    CaseFilesView view,
    String? cursor,
    int limit,
  ) async {
    final env = await guardApiCall(
      () => _client.listCaseFiles(
        id: view.caseId,
        limit: limit,
        cursor: cursor,
        kind: _kind(view.media),
        source: switch (view.filter) {
          1 => api.CaseFilesSource.task,
          2 => api.CaseFilesSource.update,
          _ => null,
        },
        sample: view.filter == 3 ? true : null,
      ),
    );
    return CursorPage(items: env.data, nextCursor: env.meta?.nextCursor);
  }

  @override
  Future<bool> hasSamples(String caseId, {required bool media}) async {
    final env = await guardApiCall(
      () => _client.listCaseFiles(
        id: caseId,
        limit: 1,
        kind: _kind(media),
        sample: true,
      ),
    );
    return env.data.isNotEmpty;
  }
}

final caseFilesRemoteProvider = Provider<CaseFilesRemote>(
  (ref) => ApiCaseFilesRemote(ref.watch(caseWorkspaceClientProvider)),
);

final caseTasksProvider =
    FutureProvider.autoDispose.family<api.CaseTasksDto, String>(
  (ref, id) async {
    // R-385: kept 2 min (no realtime here; own actions invalidate).
    ref.keepAliveFor(KeepWindows.workspace);
    return (await guardApiCall(
      () => ref.watch(caseWorkspaceClientProvider).listCaseTasks(id: id),
    ))
        .data;
  },
  retry: _noRetry,
);

final caseUpdatesProvider =
    FutureProvider.autoDispose.family<List<api.CaseUpdateDto>, String>(
  (ref, id) async {
    // R-385: kept 2 min (no realtime here; own actions invalidate).
    ref.keepAliveFor(KeepWindows.workspace);
    return (await guardApiCall(
      () => ref.watch(caseWorkspaceClientProvider).listCaseUpdates(id: id),
    ))
        .data;
  },
  retry: _noRetry,
);

final caseActivityProvider =
    FutureProvider.autoDispose.family<List<api.CaseActivityDto>, String>(
  (ref, id) async {
    // R-385: kept 2 min (no realtime here; own actions invalidate).
    ref.keepAliveFor(KeepWindows.workspace);
    return (await guardApiCall(
      () => ref.watch(caseWorkspaceClientProvider).listCaseActivity(id: id),
    ))
        .data;
  },
  retry: _noRetry,
);

/// A file the user picked: its bytes and the note they wrote for it.
class PickedCaseFile {
  PickedCaseFile({
    required this.bytes,
    required this.name,
    this.description = '',
    this.sample = false,
  });

  final Uint8List bytes;
  final String name;
  String description;
  bool sample;

  bool get isImage {
    final n = name.toLowerCase();
    return n.endsWith('.jpg') ||
        n.endsWith('.jpeg') ||
        n.endsWith('.png') ||
        n.endsWith('.webp') ||
        n.endsWith('.heic');
  }
}

/// Mutations of the workspace. Each one refreshes the lists it changes,
/// so both tabs and the counters stay in step.
class CaseWorkspaceActions {
  CaseWorkspaceActions(this._ref);

  final Ref _ref;

  api.CasesClient get _c => _ref.read(caseWorkspaceClientProvider);

  void _refresh(String caseId) {
    _ref
      ..invalidate(caseWorkspaceProvider(caseId))
      ..invalidate(caseFilesProvider(caseId))
      ..invalidate(caseTasksProvider(caseId))
      ..invalidate(caseUpdatesProvider(caseId))
      ..invalidate(caseActivityProvider(caseId));
  }

  Future<List<api.CaseFileInputDto>> _upload(List<PickedCaseFile> files) async {
    final repo = _ref.read(socialRepositoryProvider);
    final out = <api.CaseFileInputDto>[];
    for (final f in files) {
      final id = await repo.uploadPostPhoto(
        f.bytes,
        casePhoto: true,
        fileName: f.name,
        maxBytes: 50 * 1024 * 1024,
      );
      out.add(
        api.CaseFileInputDto(
          fileId: id,
          description: f.description.trim().isEmpty ? null : f.description,
          sample: f.sample ? true : null,
        ),
      );
    }
    return out;
  }

  /// Owner 2026-11-08 (instant, the app's own queue): an update with files
  /// is a job of the persistent upload queue — it returns as soon as it is
  /// queued, the files go up after the sheet is gone (and after a restart),
  /// and the update is written once (the job id is its Idempotency-Key).
  /// A text-only update is written at once, as before.
  Future<void> addUpdate(
    String caseId,
    String body,
    List<PickedCaseFile> files,
  ) async {
    if (files.isNotEmpty) {
      await _ref.read(caseFilesOutboxProvider).submit(caseId, body, files);
      return;
    }
    await guardApiCall(
      () => _c.addCaseUpdate(
        id: caseId,
        body: api.CreateCaseUpdateDto(body: body, files: const []),
      ),
    );
    _refresh(caseId);
  }

  /// What shows the case's workspace reads again.
  void refresh(String caseId) => _refresh(caseId);

  Future<void> markUpdatesSeen(String caseId) async {
    // Owner 2026-11-05: the case screen shows no «new» number any more, so
    // the summary is not asked for again.
    await guardApiCall(() => _c.markCaseUpdatesSeen(id: caseId));
  }

  Future<void> createTask(
    String caseId, {
    required api.CreateCaseTaskDtoKind kind,
    required String title,
    String? description,
    List<String> items = const [],
    List<PickedCaseFile> files = const [],
    DateTime? dueAt,
    int? remindBeforeMin,
  }) async {
    final uploaded = await _upload(files);
    await guardApiCall(
      () => _c.createCaseTask(
        id: caseId,
        body: api.CreateCaseTaskDto(
          kind: kind,
          title: title,
          description: description,
          dueAt: dueAt?.toUtc(),
          remindBeforeMin: remindBeforeMin,
          items: items.isEmpty ? null : items,
          files: uploaded.isEmpty ? null : uploaded,
        ),
      ),
    );
    _refresh(caseId);
  }

  Future<void> setTaskDone(
    String caseId,
    String taskId, {
    required bool done,
  }) async {
    await guardApiCall(
      () => _c.setCaseTaskDone(
        id: caseId,
        taskId: taskId,
        body: api.TaskDoneDto(done: done),
      ),
    );
    _refresh(caseId);
  }

  Future<void> setItemDone(
    String caseId,
    String taskId,
    String itemId, {
    required bool done,
  }) async {
    await guardApiCall(
      () => _c.setCaseTaskItemDone(
        id: caseId,
        taskId: taskId,
        itemId: itemId,
        body: api.TaskDoneDto(done: done),
      ),
    );
    _refresh(caseId);
  }

  Future<void> setTaskClosed(
    String caseId,
    String taskId, {
    required bool closed,
  }) async {
    await guardApiCall(
      () => closed
          ? _c.closeCaseTask(id: caseId, taskId: taskId)
          : _c.reopenCaseTask(id: caseId, taskId: taskId),
    );
    _refresh(caseId);
  }

  Future<void> submit(
    String caseId,
    String taskId, {
    String? note,
    String? itemId,
    List<PickedCaseFile> files = const [],
  }) async {
    final uploaded = await _upload(files);
    await guardApiCall(
      () => _c.submitCaseTask(
        id: caseId,
        taskId: taskId,
        body: api.TaskSubmissionDto(
          note: note,
          itemId: itemId,
          files: uploaded,
        ),
      ),
    );
    _refresh(caseId);
  }
}

final caseWorkspaceActionsProvider =
    Provider<CaseWorkspaceActions>(CaseWorkspaceActions.new);
