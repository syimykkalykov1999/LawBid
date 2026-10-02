import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart'
    show sha256Hex;
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// OQ-048: team, approvals, tasks and bid drafts. Throws `ApiException`.
abstract interface class TeamRepository {
  // The assistant themself.
  Future<AssistantMe> assistantMe();
  Future<AssistantMe> acceptInvite();
  Future<void> requestJoinCode(String attorneyPhone);
  Future<AssistantMe> verifyJoinCode(String attorneyPhone, String code);

  // The attorney's team.
  Future<TeamInfo> team();
  Future<TeamInfo> addAssistant(
    String phone, {
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  });

  /// OQ-049: [acceptLiability] — the attorney accepted responsibility for
  /// the newly switched-on duties (required by the server).
  Future<TeamInfo> updateAssistant(
    String id, {
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  });
  Future<TeamInfo> removeAssistant(String id);
  Future<CursorPage<ActivityEntry>> activity({
    String? membershipId,
    String? cursor,
  });

  // Approvals.
  Future<AssistantRequest> createRequest(
    RequestKind kind,
    Map<String, Object?> payload,
  );
  Future<CursorPage<AssistantRequest>> requests({
    RequestStatus? status,
    String? cursor,
  });
  Future<AssistantRequest> approve(String id, {String? note});
  Future<AssistantRequest> reject(String id, {String? note});

  // Tasks.
  Future<List<TaskItem>> tasks({bool done = false, bool mine = false});
  Future<TaskItem> task(String id);
  Future<TaskItem> createTask(TaskDraft draft);
  Future<TaskItem> setTaskStatus(
    String id,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  });
  Future<String> uploadTaskFile(Uint8List bytes, String mime);

  /// Owner 2026-10-01: edit a planner card (every field of [draft];
  /// null optional fields are cleared) / delete it with its steps.
  Future<TaskItem> updateTask(String id, TaskDraft draft);
  Future<void> deleteTask(String id);

  // Owner 2026-10-01: a task's checklist steps.
  Future<TaskItem> addTaskStep(String taskId, TaskStepDraft step);

  /// Check a step off ([status]), add a [note], or move it ([dueAt]).
  Future<TaskItem> updateTaskStep(
    String taskId,
    String stepId, {
    TaskStatus? status,
    String? note,
    DateTime? dueAt,
  });
  Future<TaskItem> removeTaskStep(String taskId, String stepId);

  // Bid drafts.
  Future<BidDraft?> bidDraft(String caseId);
  Future<BidDraft> saveBidDraft(
    String caseId, {
    String? feeType,
    int? amountCents,
    String? message,
    String? startAvailability,
    DateTime? startDate,
    int? estimatedDurationDays,
  });
  Future<void> deleteBidDraft(String caseId);
}

class ApiTeamRepository implements TeamRepository {
  ApiTeamRepository(Dio dio, {Dio? storageDio})
      : _api = api.AssistantsClient(dio),
        _bids = api.BidsClient(dio),
        _files = api.FilesClient(dio),
        _storage = storageDio ?? dio;

  final api.AssistantsClient _api;
  final api.BidsClient _bids;
  final api.FilesClient _files;
  final Dio _storage;

  static DateTime? _date(String? raw) =>
      raw == null ? null : DateTime.tryParse(raw)?.toLocal();

  static AssistantMe _me(api.AssistantMeDto d) => AssistantMe(
        state: switch (d.state.json) {
          'active' => AssistantState.active,
          'invited' => AssistantState.invited,
          'paused' => AssistantState.paused,
          _ => AssistantState.none,
        },
        membershipId: d.membershipId,
        attorneyId: d.attorneyId,
        attorneyName: d.attorneyName,
        attorneyUsername: d.attorneyUsername,
        attorneyAvatarUrl: d.attorneyAvatarUrl,
        duties: AssistantDuty.parseAll(d.duties),
      );

  static TeamInfo _team(api.TeamDto d) => TeamInfo(
        members: [
          for (final m in d.members)
            TeamMember(
              id: m.id,
              phone: m.phone,
              name: m.name,
              status: switch (m.status.json) {
                'active' => MemberStatus.active,
                'removed' => MemberStatus.removed,
                _ => MemberStatus.invited,
              },
              approval: m.approval.json ?? 'attorney_added',
              duties: AssistantDuty.parseAll(m.duties),
              joinedAt: _date(m.joinedAt),
              liabilityAcceptedAt: _date(m.liabilityAcceptedAt),
              createdAt: _date(m.createdAt) ?? DateTime.now(),
            ),
        ],
        seats: d.seats,
        used: d.used,
        plan: d.plan.json ?? 'none',
      );

  static ActivityEntry _activity(api.ActivityDto a) => ActivityEntry(
        id: a.id,
        membershipId: a.membershipId,
        assistantName: a.assistantName,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        summary: a.summary,
        createdAt: _date(a.createdAt) ?? DateTime.now(),
      );

  static AssistantRequest _request(api.AssistantRequestDto r) =>
      AssistantRequest(
        id: r.id,
        membershipId: r.membershipId,
        assistantName: r.assistantName,
        kind: RequestKind.parse(r.kind.json),
        payload: r.payload is Map
            ? Map<String, Object?>.from(r.payload as Map)
            : const {},
        status: RequestStatus.parse(r.status.json),
        resultId: r.resultId,
        note: r.note,
        mediaUrls: r.mediaUrls,
        practiceName: r.practiceName,
        createdAt: _date(r.createdAt) ?? DateTime.now(),
        decidedAt: _date(r.decidedAt),
      );

  static TaskItem _task(api.TaskDto t) => TaskItem(
        id: t.id,
        kind: TaskKind.parse(t.kind.json),
        title: t.title,
        notes: t.notes,
        dueAt: _date(t.dueAt),
        location: t.location,
        caseId: t.caseId,
        caseTitle: t.caseTitle,
        contactName: t.contactName,
        contactPhone: t.contactPhone,
        contactEmail: t.contactEmail,
        files: [
          for (final f in t.files)
            TaskFile(fileId: f.fileId, url: f.url, mime: f.mime),
        ],
        status: TaskStatus.parse(t.status.json),
        outcomeNote: t.outcomeNote,
        rescheduledTo: _date(t.rescheduledTo),
        createdByName: t.createdByName,
        canDelete: t.canDelete,
        createdAt: _date(t.createdAt) ?? DateTime.now(),
        doneAt: _date(t.doneAt),
        steps: [
          for (final s in t.steps)
            TaskStep(
              id: s.id,
              title: s.title,
              status: TaskStatus.parse(s.status.json),
              kind: s.kind == null ? null : TaskKind.parse(s.kind!.json),
              dueAt: _date(s.dueAt),
              location: s.location,
              contactName: s.contactName,
              contactPhone: s.contactPhone,
              contactEmail: s.contactEmail,
              note: s.note,
              doneAt: _date(s.doneAt),
              createdByName: s.createdByName,
            ),
        ],
      );

  static api.TaskStepInputDto _stepInput(TaskStepDraft s) =>
      api.TaskStepInputDto(
        kind:
            s.kind == null ? null : api.AttorneyTaskKind.fromJson(s.kind!.wire),
        title: s.title,
        dueAt: s.dueAt?.toUtc(),
        location: s.location,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
        contactEmail: s.contactEmail,
      );

  static BidDraft _draft(api.BidDraftDto d) => BidDraft(
        caseId: d.caseId,
        feeType: d.feeType?.json,
        amountCents: d.amountCents,
        message: d.message,
        startAvailability: d.startAvailability?.json,
        startDate: d.startDate,
        estimatedDurationDays: d.estimatedDurationDays,
        preparedBy: d.preparedBy,
        updatedAt: _date(d.updatedAt) ?? DateTime.now(),
      );

  static List<String>? _duties(Set<AssistantDuty>? d) =>
      d == null ? null : [for (final x in d) x.wire];

  @override
  Future<AssistantMe> assistantMe() async =>
      _me((await guardApiCall(_api.getAssistantMe)).data);

  @override
  Future<AssistantMe> acceptInvite() async =>
      _me((await guardApiCall(_api.acceptAssistantInvite)).data);

  @override
  Future<void> requestJoinCode(String attorneyPhone) => guardApiCall(
        () => _api.requestAssistantCode(
          body: api.AssistantPhoneDto(phone: attorneyPhone),
        ),
      );

  @override
  Future<AssistantMe> verifyJoinCode(String attorneyPhone, String code) async =>
      _me(
        (await guardApiCall(
          () => _api.verifyAssistantCode(
            body: api.JoinVerifyDto(
              attorneyPhone: attorneyPhone,
              code: code,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<TeamInfo> team() async =>
      _team((await guardApiCall(_api.getTeam)).data);

  @override
  Future<TeamInfo> addAssistant(
    String phone, {
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  }) async =>
      _team(
        (await guardApiCall(
          () => _api.addAssistant(
            body: api.AddAssistantDto(
              phone: phone,
              name: name,
              acceptLiability: acceptLiability ? true : null,
              duties: _duties(duties)
                  ?.map(api.AddAssistantDtoDuties.fromJson)
                  .toList(),
            ),
          ),
        ))
            .data,
      );

  @override
  Future<TeamInfo> updateAssistant(
    String id, {
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  }) async =>
      _team(
        (await guardApiCall(
          () => _api.updateAssistant(
            id: id,
            body: api.UpdateAssistantDto(
              name: name,
              acceptLiability: acceptLiability ? true : null,
              duties: _duties(duties)
                  ?.map(api.UpdateAssistantDtoDuties.fromJson)
                  .toList(),
            ),
          ),
        ))
            .data,
      );

  @override
  Future<TeamInfo> removeAssistant(String id) async =>
      _team((await guardApiCall(() => _api.removeAssistant(id: id))).data);

  @override
  Future<CursorPage<ActivityEntry>> activity({
    String? membershipId,
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _api.getTeamActivity(membershipId: membershipId, cursor: cursor),
    );
    return CursorPage(
      items: [for (final a in env.data) _activity(a)],
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<AssistantRequest> createRequest(
    RequestKind kind,
    Map<String, Object?> payload,
  ) async =>
      _request(
        (await guardApiCall(
          () => _api.createAssistantRequest(
            body: api.CreateAssistantRequestDto(
              kind: api.AssistantRequestKind.fromJson(kind.wire),
              payload: payload,
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  @override
  Future<CursorPage<AssistantRequest>> requests({
    RequestStatus? status,
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _api.listAssistantRequests(
        status: status == null
            ? null
            : api.AssistantRequestStatus.fromJson(status.name),
        cursor: cursor,
      ),
    );
    return CursorPage(
      items: [for (final r in env.data) _request(r)],
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<AssistantRequest> approve(String id, {String? note}) async => _request(
        (await guardApiCall(
          () => _api.approveAssistantRequest(
            id: id,
            body: api.DecideRequestDto(note: note),
          ),
        ))
            .data,
      );

  @override
  Future<AssistantRequest> reject(String id, {String? note}) async => _request(
        (await guardApiCall(
          () => _api.rejectAssistantRequest(
            id: id,
            body: api.DecideRequestDto(note: note),
          ),
        ))
            .data,
      );

  @override
  Future<List<TaskItem>> tasks({bool done = false, bool mine = false}) async {
    final env = await guardApiCall(
      () => _api.listTasks(
        view: done ? api.TasksView.done : api.TasksView.active,
        mine: mine ? true : null,
      ),
    );
    return [for (final t in env.data) _task(t)];
  }

  @override
  Future<TaskItem> task(String id) async =>
      _task((await guardApiCall(() => _api.getTask(id: id))).data);

  @override
  Future<TaskItem> createTask(TaskDraft d) async => _task(
        (await guardApiCall(
          () => _api.createTask(
            body: api.CreateTaskDto(
              kind: api.AttorneyTaskKind.fromJson(d.kind.wire),
              title: d.title,
              notes: d.notes,
              dueAt: d.dueAt?.toUtc(),
              location: d.location,
              caseId: d.caseId,
              contactName: d.contactName,
              contactPhone: d.contactPhone,
              contactEmail: d.contactEmail,
              fileIds: d.fileIds.isEmpty ? null : d.fileIds,
              steps: d.steps.isEmpty
                  ? null
                  : [for (final s in d.steps) _stepInput(s)],
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  @override
  Future<TaskItem> setTaskStatus(
    String id,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  }) async =>
      _task(
        (await guardApiCall(
          () => _api.setTaskStatus(
            id: id,
            body: api.UpdateTaskStatusDto(
              status: api.UpdateTaskStatusDtoStatus.fromJson(status.wire),
              outcomeNote: note,
              rescheduleTo: rescheduleTo?.toUtc(),
            ),
          ),
        ))
            .data,
      );

  @override
  Future<TaskItem> updateTask(String id, TaskDraft d) async => _task(
        (await guardApiCall(
          () => _api.updateTask(
            id: id,
            body: api.UpdateTaskDto(
              kind: api.AttorneyTaskKind.fromJson(d.kind.wire),
              title: d.title,
              notes: d.notes ?? '',
              dueAt: d.dueAt?.toUtc(),
              clearDueAt: d.dueAt == null ? true : null,
              location: d.location ?? '',
              contactName: d.contactName ?? '',
              contactPhone: d.contactPhone ?? '',
              contactEmail: d.contactEmail ?? '',
              fileIds: d.fileIds,
              caseId: d.caseId,
              clearCaseId: d.caseId == null ? true : null,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<void> deleteTask(String id) =>
      guardApiCall(() => _api.deleteTask(id: id));

  @override
  Future<TaskItem> addTaskStep(String taskId, TaskStepDraft step) async =>
      _task(
        (await guardApiCall(
          () => _api.addTaskStep(id: taskId, body: _stepInput(step)),
        ))
            .data,
      );

  @override
  Future<TaskItem> updateTaskStep(
    String taskId,
    String stepId, {
    TaskStatus? status,
    String? note,
    DateTime? dueAt,
  }) async =>
      _task(
        (await guardApiCall(
          () => _api.updateTaskStep(
            id: taskId,
            stepId: stepId,
            body: api.UpdateTaskStepDto(
              status: status == null
                  ? null
                  : api.TaskStepStatus.fromJson(status.wire),
              note: note,
              dueAt: dueAt?.toUtc(),
            ),
          ),
        ))
            .data,
      );

  @override
  Future<TaskItem> removeTaskStep(String taskId, String stepId) async => _task(
        (await guardApiCall(
          () => _api.removeTaskStep(id: taskId, stepId: stepId),
        ))
            .data,
      );

  @override
  Future<String> uploadTaskFile(Uint8List bytes, String mime) async {
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: api.FilePurpose.taskAttachment,
          mime: mime,
          sizeBytes: bytes.length,
          sha256: sha256Hex(bytes),
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    final parts = mime.split('/');
    try {
      await _storage.post<void>(
        target.upload.url,
        data: FormData.fromMap({
          ...target.upload.fields,
          // S3 POST policy: the file must be the LAST field.
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'file',
            contentType: DioMediaType(parts.first, parts.last),
          ),
        }),
      );
    } on DioException catch (e) {
      throw ApiException(
        code: e.response == null
            ? ApiException.networkErrorCode
            : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
    var status = (await guardApiCall(() => _files.confirm(id: target.fileId)))
        .data
        .scanStatus;
    for (var i = 0; status == api.ScanStatus.pending && i < 40; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 700));
      status = (await guardApiCall(() => _files.getFilesId(id: target.fileId)))
          .data
          .scanStatus;
    }
    if (status != api.ScanStatus.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
    return target.fileId;
  }

  @override
  Future<BidDraft?> bidDraft(String caseId) async {
    try {
      return _draft(
        (await guardApiCall(() => _bids.getBidDraft(id: caseId))).data,
      );
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  @override
  Future<BidDraft> saveBidDraft(
    String caseId, {
    String? feeType,
    int? amountCents,
    String? message,
    String? startAvailability,
    DateTime? startDate,
    int? estimatedDurationDays,
  }) async =>
      _draft(
        (await guardApiCall(
          () => _bids.saveBidDraft(
            id: caseId,
            body: api.BidDraftBodyDto(
              feeType: feeType == null ? null : api.FeeType.fromJson(feeType),
              amountCents: amountCents,
              message: message,
              startAvailability: startAvailability == null
                  ? null
                  : api.StartAvailability.fromJson(startAvailability),
              startDate: startDate,
              estimatedDurationDays: estimatedDurationDays,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<void> deleteBidDraft(String caseId) =>
      guardApiCall(() => _bids.deleteBidDraft(id: caseId));
}
