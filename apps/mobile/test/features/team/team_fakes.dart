import 'dart:typed_data';

import 'package:lawbid/features/team/data/team_repository.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final _now = DateTime.now();

TaskItem makeTask(
  String id, {
  TaskKind kind = TaskKind.call,
  TaskStatus status = TaskStatus.open,
  DateTime? dueAt,
  String? by = 'Sam',
  String? note,
  List<TaskStep> steps = const [],
}) =>
    TaskItem(
      steps: steps,
      id: id,
      kind: kind,
      title: 'Task $id',
      status: status,
      dueAt: dueAt,
      createdByName: by,
      outcomeNote: note,
      contactName: 'John Brown',
      contactPhone: '+13125550199',
      createdAt: _now,
    );

AssistantRequest makeRequest(String id,
        {RequestStatus status = RequestStatus.pending}) =>
    AssistantRequest(
      id: id,
      membershipId: 'm1',
      assistantName: 'Sam Helper',
      kind: RequestKind.post,
      payload: const {
        'title': 'Custody basics',
        'body': 'What parents should know.',
        'practiceCode': 'family_law',
      },
      status: status,
      createdAt: _now,
    );

class FakeTeamRepository implements TeamRepository {
  final List<String> calls = [];
  List<TaskItem> active = [];
  List<TaskItem> done = [];
  List<AssistantRequest> requestList = [];
  List<ActivityEntry> activityList = [];
  AssistantMe me = AssistantMe.none;
  TeamInfo teamInfo = const TeamInfo(
    members: [],
    seats: 2,
    used: 0,
    plan: 'monthly',
  );

  @override
  Future<AssistantMe> assistantMe() async => me;

  @override
  Future<AssistantMe> acceptInvite() async {
    calls.add('accept');
    return me = AssistantMe(
      state: AssistantState.active,
      duties: me.duties,
      attorneyName: me.attorneyName,
      attorneyId: 'att-1',
    );
  }

  @override
  Future<void> requestJoinCode(String attorneyPhone) async =>
      calls.add('code:$attorneyPhone');

  @override
  Future<AssistantMe> verifyJoinCode(String attorneyPhone, String code) async {
    calls.add('verify:$attorneyPhone:$code');
    return me = const AssistantMe(
      state: AssistantState.active,
      duties: {AssistantDuty.tasks},
      attorneyName: 'Ada Counsel',
    );
  }

  @override
  Future<TeamInfo> team() async => teamInfo;

  @override
  Future<TeamInfo> addAssistant(
    String phone, {
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  }) async {
    calls.add('add:$phone:$name');
    return teamInfo = TeamInfo(
      members: [
        ...teamInfo.members,
        TeamMember(
          id: 'm${teamInfo.members.length + 1}',
          phone: phone,
          name: name,
          status: MemberStatus.invited,
          approval: 'attorney_added',
          duties: const {AssistantDuty.chats, AssistantDuty.tasks},
          createdAt: _now,
        ),
      ],
      seats: teamInfo.seats,
      used: teamInfo.used + 1,
      plan: teamInfo.plan,
    );
  }

  @override
  Future<TeamInfo> updateAssistant(
    String id, {
    String? name,
    Set<AssistantDuty>? duties,
    bool acceptLiability = false,
  }) async {
    calls.add(
      'update:$id:${duties?.map((d) => d.wire).join(',')}:$acceptLiability',
    );
    return teamInfo;
  }

  @override
  Future<TeamInfo> removeAssistant(String id) async {
    calls.add('remove:$id');
    return teamInfo;
  }

  @override
  Future<CursorPage<ActivityEntry>> activity({
    String? membershipId,
    String? cursor,
  }) async =>
      CursorPage(items: activityList);

  @override
  Future<AssistantRequest> createRequest(
    RequestKind kind,
    Map<String, Object?> payload,
  ) async {
    calls.add('request:${kind.wire}');
    return makeRequest('new');
  }

  @override
  Future<CursorPage<AssistantRequest>> requests({
    RequestStatus? status,
    String? cursor,
  }) async =>
      CursorPage(
        items: status == null
            ? requestList
            : requestList.where((r) => r.status == status).toList(),
      );

  @override
  Future<AssistantRequest> approve(String id, {String? note}) async {
    calls.add('approve:$id');
    return makeRequest(id, status: RequestStatus.approved);
  }

  @override
  Future<AssistantRequest> reject(String id, {String? note}) async {
    calls.add('reject:$id:$note');
    return makeRequest(id, status: RequestStatus.rejected);
  }

  @override
  Future<List<TaskItem>> tasks({bool done = false, bool mine = false}) async =>
      done ? this.done : active;

  @override
  Future<TaskItem> task(String id) async =>
      [...active, ...done].firstWhere((t) => t.id == id);

  @override
  Future<TaskItem> createTask(TaskDraft draft) async {
    calls.add('create:${draft.kind.name}:${draft.title}');
    if (draft.steps.isNotEmpty) {
      calls.add('steps:${draft.steps.map((s) => s.title).join('|')}');
    }
    final t = makeTask('new', kind: draft.kind, by: null);
    active = [...active, t];
    return t;
  }

  @override
  Future<TaskItem> setTaskStatus(
    String id,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
  }) async {
    calls.add('status:$id:${status.wire}:$note');
    final updated = makeTask(id, status: status, note: note);
    active = [
      for (final t in active)
        if (t.id != id) t
    ];
    done = [
      for (final t in done)
        if (t.id != id) t
    ];
    if (status.active) {
      active = [...active, updated];
    } else {
      done = [...done, updated];
    }
    return updated;
  }

  @override
  Future<String> uploadTaskFile(Uint8List bytes, String mime) async => 'f1';

  TaskItem _replace(String id, List<TaskStep> Function(List<TaskStep>) f) {
    final t = [...active, ...done].firstWhere((t) => t.id == id);
    final steps = f(t.steps);
    final all = steps.isNotEmpty && steps.every((s) => s.checked);
    final updated = makeTask(
      id,
      kind: t.kind,
      by: t.createdByName,
      dueAt: t.dueAt,
      steps: steps,
      status: all ? TaskStatus.done : TaskStatus.open,
    );
    active = [
      for (final x in active)
        if (x.id != id) x,
      if (updated.status.active) updated,
    ];
    done = [
      for (final x in done)
        if (x.id != id) x,
      if (!updated.status.active) updated,
    ];
    return updated;
  }

  @override
  Future<TaskItem> addTaskStep(String taskId, TaskStepDraft step) async {
    calls.add('step+:$taskId:${step.title}');
    return _replace(taskId, (s) => [
          ...s,
          TaskStep(id: 's${s.length + 1}', title: step.title, dueAt: step.dueAt),
        ]);
  }

  @override
  Future<TaskItem> updateTaskStep(
    String taskId,
    String stepId, {
    TaskStatus? status,
    String? note,
    DateTime? dueAt,
  }) async {
    calls.add('step:$taskId:$stepId:${status?.wire}:$note');
    return _replace(taskId, (s) => [
          for (final x in s)
            x.id == stepId
                ? TaskStep(
                    id: x.id,
                    title: x.title,
                    status: status ?? x.status,
                    dueAt: dueAt ?? x.dueAt,
                    note: note ?? x.note,
                  )
                : x,
        ]);
  }

  @override
  Future<TaskItem> removeTaskStep(String taskId, String stepId) async {
    calls.add('step-:$taskId:$stepId');
    return _replace(taskId, (s) => [
          for (final x in s)
            if (x.id != stepId) x,
        ]);
  }

  @override
  Future<BidDraft?> bidDraft(String caseId) async => null;

  @override
  Future<BidDraft> saveBidDraft(
    String caseId, {
    String? feeType,
    int? amountCents,
    String? message,
    String? startAvailability,
    DateTime? startDate,
    int? estimatedDurationDays,
  }) async {
    calls.add('draft:$caseId:$amountCents');
    return BidDraft(caseId: caseId, updatedAt: _now, amountCents: amountCents);
  }

  @override
  Future<void> deleteBidDraft(String caseId) async {}
}
