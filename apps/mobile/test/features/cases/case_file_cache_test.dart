import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/open_local_file.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/ux_harness.dart';

/// A storage that counts its requests; [fail] refuses them like a lost
/// connection.
class _Storage implements HttpClientAdapter {
  int requests = 0;
  bool fail = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests++;
    if (fail) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'no network',
      );
    }
    const body = [1, 2, 3, 4];
    return ResponseBody(
      Stream.value(Uint8List.fromList(body)),
      200,
      headers: {
        HttpHeaders.contentLengthHeader: ['${body.length}'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Session extends SessionController {
  @override
  SessionState? build() => null;

  void signIn(String sub) => state = SessionState(
        accessToken: 'test-access-token',
        sub: sub,
        role: null,
        sid: 'test-sid',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime(2030),
      );

  void signOut() => state = null;
}

const _signedOnce = 'https://cdn.test/f.pdf?X-Amz-Signature=first';
const _signedAgain = 'https://cdn.test/f.pdf?X-Amz-Signature=second';

FileRef _ref(String url) =>
    FileRef(fileId: 'file-1', mime: 'application/pdf', url: url);

void main() {
  late Directory root;
  late _Storage storage;
  late List<String> opened;
  late ResumableDownload realDownload;

  File kept() => File('${root.path}/$caseFilesFolder/file-1.pdf');

  setUp(() {
    root = Directory.systemTemp.createTempSync('case_file_cache_');
    storage = _Storage();
    opened = [];
    realDownload = ResumableDownload.instance;
    ResumableDownload.instance = ResumableDownload(
      dio: Dio()..httpClientAdapter = storage,
    );
    CaseFileCache.debugRoot = () async => root;
    debugOpenLocalFile = (path, mime) async {
      opened.add(path);
      return OpenLocalResult.opened;
    };
  });

  tearDown(() {
    ResumableDownload.instance = realDownload;
    CaseFileCache.debugRoot = null;
    debugOpenLocalFile = null;
    root.deleteSync(recursive: true);
  });

  test('a file on the device opens without the network', () async {
    await CaseFileCache.download(_ref(_signedOnce));
    expect(storage.requests, 1);

    storage.fail = true;
    await CaseFileCache.openKept(_ref(_signedOnce));

    expect(storage.requests, 1);
    expect(opened, [kept().path]);
  });

  test('the same file under a fresh signed link is not fetched again',
      () async {
    await CaseFileCache.download(_ref(_signedOnce));
    await CaseFileCache.openKept(_ref(_signedAgain));

    expect(storage.requests, 1);
    expect(await CaseFileCache.isDownloaded(_ref(_signedAgain)), isTrue);
  });

  test('a deleted file is downloaded again, without an error', () async {
    await CaseFileCache.download(_ref(_signedOnce));
    kept().deleteSync();
    expect(await CaseFileCache.isDownloaded(_ref(_signedOnce)), isFalse);

    await CaseFileCache.openKept(_ref(_signedAgain));

    expect(storage.requests, 2);
    expect(kept().existsSync(), isTrue);
    expect(opened, hasLength(1));
  });

  group('«Данные и память»', () {
    late CacheDatabase db;
    late CacheMaintenance maintenance;

    setUp(() {
      driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
      db = CacheDatabase(NativeDatabase.memory());
      maintenance = CacheMaintenance(
        db: db,
        pages: null,
        limits: () => const CacheLimits(),
        caseFiles: MediaCacheDir(caseFilesFolder, root: () async => root),
      );
    });
    tearDown(() => db.close());

    test('shows the downloaded files under documents', () async {
      await CaseFileCache.download(_ref(_signedOnce));

      final report = await maintenance.measure();

      expect(report.of(CacheStore.files), 4);
      expect(report.ofCategory(StorageCategory.documents), 4);
    });

    test('«Очистить» of documents deletes them; the next tap fetches again',
        () async {
      await CaseFileCache.download(_ref(_signedOnce));

      await maintenance.clearCategories({StorageCategory.documents});

      expect(kept().existsSync(), isFalse);
      await CaseFileCache.openKept(_ref(_signedOnce));
      expect(storage.requests, 2);
    });

    test('the app notices the sign-out and deletes them', () async {
      SharedPreferences.setMockInitialValues({});
      final kv = LocalKvStore(await SharedPreferences.getInstance());
      final session = _Session();
      final container = ProviderContainer(
        overrides: [
          sessionControllerProvider.overrideWith(() => session),
          localKvStoreProvider.overrideWithValue(kv),
          cacheMaintenanceProvider.overrideWithValue(maintenance),
        ],
      );
      addTearDown(container.dispose);
      container.read(accountFilesGuardProvider);
      session.signIn('user-a');
      await pumpEventQueue();
      await CaseFileCache.download(_ref(_signedOnce));

      session.signOut();
      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(kept().existsSync(), isFalse);
    });

    test('leaving the account deletes them', () async {
      await CaseFileCache.download(_ref(_signedOnce));

      await maintenance.clearAccountFiles();

      expect(kept().existsSync(), isFalse);
    });
  });

  group('whose files', () {
    late LocalKvStore kv;
    late int wipes;

    Future<bool> change(String? previous, String? next) =>
        wipeAccountFilesIfChanged(
          previous: previous,
          next: next,
          kv: kv,
          wipe: () async => wipes++,
        );

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      kv = LocalKvStore(await SharedPreferences.getInstance());
      wipes = 0;
      await kv.setString(caseFilesOwnerKey, 'user-a');
    });

    test('the same account after a restart keeps them', () async {
      expect(await change(null, 'user-a'), isFalse);
      expect(wipes, 0);
    });

    test('signing out wipes', () async {
      expect(await change('user-a', null), isTrue);
      expect(wipes, 1);
      expect(kv.getString(caseFilesOwnerKey), isNull);
    });

    test('another person signing in wipes, also after a closed app', () async {
      expect(await change(null, 'user-b'), isTrue);
      expect(wipes, 1);
      expect(kv.getString(caseFilesOwnerKey), 'user-b');
    });

    test('a start signed out touches nothing', () async {
      expect(await change(null, null), isFalse);
      expect(wipes, 0);
    });
  });

  group('the button', () {
    Future<void> pump(WidgetTester t) async {
      await t.pumpWidget(
        ProviderScope(
          child: uxApp(
            Scaffold(
              body: Center(
                child: FileOpenButton.ref(file: _ref(_signedOnce)),
              ),
            ),
            theme: AppTheme.dark(),
            disableAnimations: true,
          ),
        ),
      );
    }

    Future<void> settle(WidgetTester t) async {
      for (var i = 0; i < 6; i++) {
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 40)),
        );
        await t.pump(const Duration(milliseconds: 50));
      }
    }

    testWidgets('«Download» until the file is here, then «Open»', (t) async {
      await pump(t);
      await settle(t);
      expect(find.text('Download'), findsOneWidget);

      await t.tap(find.text('Download'));
      await t.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await settle(t);

      expect(find.text('Open'), findsOneWidget);
      expect(opened, isEmpty);

      await t.tap(find.text('Open'));
      await settle(t);
      expect(opened, hasLength(1));
      expect(storage.requests, 1);
    });

    testWidgets('a file already on the device says «Open» at once', (t) async {
      await t.runAsync(() => CaseFileCache.download(_ref(_signedOnce)));
      await pump(t);
      await settle(t);

      expect(find.text('Open'), findsOneWidget);
    });

    testWidgets('a lost connection: a message, and «Download» tries again',
        (t) async {
      storage.fail = true;
      await pump(t);
      await settle(t);

      await t.tap(find.text('Download'));
      await t.pump();
      await settle(t);
      expect(find.textContaining('download the file'), findsWidgets);
      expect(find.text('Download'), findsOneWidget);

      storage.fail = false;
      await t.tap(find.text('Download'));
      await t.pump();
      await settle(t);
      expect(find.text('Open'), findsOneWidget);
    });
  });
}
