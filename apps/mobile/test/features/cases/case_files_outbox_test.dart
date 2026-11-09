import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/cases/workspace/case_files_outbox.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/upload_queue_overrides.dart';
import '../social/social_fakes.dart';

class _Files extends FakeSocialRepository {
  final sent = <String?>[];
  ApiException? failWith;

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
  }) async {
    final e = failWith;
    if (e != null) throw e;
    sent.add(fileName);
    return 'file-${sent.length}';
  }
}

ProviderContainer _container(
  _Files files,
  FakeHttpAdapter api_, {
  UploadQueueDatabase? db,
}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
    ..httpClientAdapter = api_
    ..interceptors.add(IdempotencyInterceptor());
  final c = ProviderContainer(
    overrides: [
      socialRepositoryProvider.overrideWithValue(files),
      caseWorkspaceClientProvider.overrideWithValue(api.CasesClient(dio)),
      ...uploadQueueOverrides(db: db, fixedOnline: true),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

Future<void> _until(bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
}

PickedCaseFile _file(String name) =>
    PickedCaseFile(bytes: Uint8List(8), name: name, description: 'note');

/// Owner 2026-11-08 (instant everywhere): a case update with files returns
/// as soon as it is queued; the files go up in the background, the update
/// is written once (Idempotency-Key = job id), and it survives the app
/// being closed.
void main() {
  test('queued at once; files go up, the update is written with its key',
      () async {
    final files = _Files();
    final updates = <RequestOptions>[];
    final adapter = FakeHttpAdapter((o) async {
      updates.add(o);
      return ok(<Object>[]);
    });
    final c = _container(files, adapter);
    await c
        .read(caseWorkspaceActionsProvider)
        .addUpdate('case-1', 'Docs attached', [_file('a.pdf'), _file('b.jpg')]);
    await _until(() => updates.isNotEmpty);
    expect(files.sent, ['a.pdf', 'b.jpg']);
    final post = updates.single;
    expect(post.path, contains('case-1'));
    expect(post.headers['Idempotency-Key'], isNotNull);
    final body = post.data as Map<String, dynamic>;
    expect((body['files'] as List).length, 2);
  });

  test('closing the app mid-way: written at the next start, exactly once',
      () async {
    final db = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final first = _Files();
    final down = FakeHttpAdapter(
      (o) async => jsonBody(
        {
          'error': {'code': 'INTERNAL', 'message': 'down'},
        },
        503,
      ),
    );
    final c1 = _container(first, down, db: db);
    await c1
        .read(caseWorkspaceActionsProvider)
        .addUpdate('case-1', 'Docs', [_file('a.pdf')]);
    await _until(() => down.requests.isNotEmpty);
    final key = down.requests.first.headers['Idempotency-Key'];
    c1.dispose(); // the app is closed

    final again = _Files();
    final updates = <RequestOptions>[];
    final up = FakeHttpAdapter((o) async {
      updates.add(o);
      return ok(<Object>[]);
    });
    final c2 = _container(again, up, db: db)..read(caseFilesOutboxProvider);
    await _until(() => updates.isNotEmpty);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(updates, hasLength(1));
    expect(updates.single.headers['Idempotency-Key'], key);
    expect(again.sent, isEmpty, reason: 'the stored file id is reused');
    c2.dispose();
  });
}
