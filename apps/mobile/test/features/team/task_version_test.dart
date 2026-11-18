import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/data/team_repository.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

import 'team_fakes.dart';

/// Audit 17.11 (batch 6): the app sends the task's `version` back as
/// `If-Match` (as cases_repository does for a bid), so two people saving
/// the same task at once get 409 STALE_VERSION instead of a silent
/// overwrite; on 409 the screen re-reads the task and shows server truth.

Map<String, dynamic> _taskJson({int version = 8, String title = 'Server'}) => {
      'id': 't1',
      'version': version,
      'kind': 'call',
      'title': title,
      'status': 'done',
      'priority': 'normal',
      'repeat': 'none',
      'canDelete': true,
      'canEdit': true,
      'canComplete': true,
      'assignedToMe': false,
      'keepForever': false,
      'files': <Object>[],
      'people': <Object>[],
      'places': <Object>[],
      'steps': <Object>[],
      'createdAt': '2026-11-17T10:00:00.000Z',
    };

/// Answers every request with one task and keeps what was sent.
(Dio, List<RequestOptions>) _dio() {
  final sent = <RequestOptions>[];
  final dio = Dio(BaseOptions(baseUrl: 'https://api.test'));
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (o, h) {
        sent.add(o);
        h.resolve(
          Response<dynamic>(
            requestOptions: o,
            statusCode: 200,
            data: {'data': _taskJson()},
          ),
        );
      },
    ),
  );
  return (dio, sent);
}

String? _ifMatch(RequestOptions o) => o.headers.entries
    .firstWhere(
      (e) => e.key.toLowerCase() == 'if-match',
      orElse: () => const MapEntry('', null),
    )
    .value
    ?.toString();

/// The status change is refused as stale; the task read returns the
/// server's newer copy.
class _StaleRepo extends FakeTeamRepository {
  final versions = <int?>[];
  int reads = 0;
  final TaskItem server = TaskItem(
    id: 'a',
    version: 9,
    kind: TaskKind.call,
    title: 'Changed by the assistant',
    status: TaskStatus.open,
    createdAt: DateTime(2026, 11, 17),
  );

  @override
  Future<TaskItem> task(String id) async {
    reads++;
    return server;
  }

  @override
  Future<TaskItem> setTaskStatus(
    String id,
    TaskStatus status, {
    String? note,
    DateTime? rescheduleTo,
    int? version,
  }) async {
    versions.add(version);
    throw const ApiException(
      code: ApiErrorCodes.staleVersion,
      message: 'Stale',
      statusCode: 409,
    );
  }
}

void main() {
  test('the task model reads the server version', () async {
    final (dio, _) = _dio();
    final t = await ApiTeamRepository(dio).task('t1');
    expect(t.version, 8);
  });

  test('a status change sends If-Match with the task version', () async {
    final (dio, sent) = _dio();
    await ApiTeamRepository(dio)
        .setTaskStatus('t1', TaskStatus.done, version: 7);
    expect(sent.single.method, 'PATCH');
    expect(sent.single.path, contains('/tasks/t1/status'));
    expect(_ifMatch(sent.single), '7');
  });

  test('an edit sends If-Match with the task version', () async {
    final (dio, sent) = _dio();
    await ApiTeamRepository(dio).updateTask(
      't1',
      const TaskDraft(kind: TaskKind.call, title: 'Edited'),
      version: 5,
    );
    expect(sent.single.method, 'PATCH');
    expect(_ifMatch(sent.single), '5');
  });

  test('a 409 STALE_VERSION re-reads the task and shows server truth',
      () async {
    final repo = _StaleRepo()..active = [makeTask('a')];
    final c = ProviderContainer(
      overrides: [teamRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(c.dispose);
    const key = (done: false, mine: false);
    final sub = c.listen(tasksProvider(key), (_, __) {});
    addTearDown(sub.close);
    await c.read(tasksProvider(key).future);

    final mine = TaskItem(
      id: 'a',
      version: 4,
      kind: TaskKind.call,
      title: 'Task a',
      status: TaskStatus.open,
      createdAt: DateTime(2026, 11, 17),
    );
    await expectLater(
      c.read(tasksProvider(key).notifier).setStatus(mine, TaskStatus.done),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.staleVersion),
      ),
    );
    expect(repo.versions, [4]);
    expect(repo.reads, 1);
    final row = c.read(tasksProvider(key)).value!.single;
    expect(row.title, 'Changed by the assistant');
    expect(row.version, 9);
  });
}
