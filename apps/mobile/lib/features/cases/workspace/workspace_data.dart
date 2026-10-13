import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialRepositoryProvider;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-13: the case workspace's data — files, tasks, updates and
/// activity of an accepted case, for the client and the attorney alike.
Duration? _noRetry(int retryCount, Object error) => null;

final caseWorkspaceClientProvider =
    Provider<api.CasesClient>((ref) => api.CasesClient(ref.watch(dioProvider)));

final caseWorkspaceProvider =
    FutureProvider.autoDispose.family<api.CaseWorkspaceDto, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseWorkspaceClientProvider).caseWorkspace(id: id),
  ))
      .data,
  retry: _noRetry,
);

final caseFilesProvider =
    FutureProvider.autoDispose.family<List<api.WorkspaceFileDto>, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseWorkspaceClientProvider).listCaseFiles(id: id),
  ))
      .data,
  retry: _noRetry,
);

final caseTasksProvider =
    FutureProvider.autoDispose.family<api.CaseTasksDto, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseWorkspaceClientProvider).listCaseTasks(id: id),
  ))
      .data,
  retry: _noRetry,
);

final caseUpdatesProvider =
    FutureProvider.autoDispose.family<List<api.CaseUpdateDto>, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseWorkspaceClientProvider).listCaseUpdates(id: id),
  ))
      .data,
  retry: _noRetry,
);

final caseActivityProvider =
    FutureProvider.autoDispose.family<List<api.CaseActivityDto>, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseWorkspaceClientProvider).listCaseActivity(id: id),
  ))
      .data,
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

  Future<void> addUpdate(
    String caseId,
    String body,
    List<PickedCaseFile> files,
  ) async {
    final uploaded = await _upload(files);
    await guardApiCall(
      () => _c.addCaseUpdate(
        id: caseId,
        body: api.CreateCaseUpdateDto(body: body, files: uploaded),
      ),
    );
    _refresh(caseId);
  }

  Future<void> markUpdatesSeen(String caseId) async {
    await guardApiCall(() => _c.markCaseUpdatesSeen(id: caseId));
    _ref.invalidate(caseWorkspaceProvider(caseId));
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
