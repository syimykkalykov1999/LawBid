import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show ChatMappers;
import 'package:lawbid/features/chat/e2ee/e2ee_media.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Item 25: the decrypted payloads in the cache database (never trimmed,
/// wiped with the account on sign-out).
class DbE2eePlaintextStore implements E2eePlaintextStore {
  DbE2eePlaintextStore(this._db, this._owner);

  final CacheDatabase _db;
  final String _owner;

  @override
  Future<String?> get(String id) async =>
      (await _db.e2eePlaintext(_owner, id))?.payload;

  @override
  Future<void> put(String id, String conversationId, String payload) =>
      _db.putE2eePlaintext(
        E2eePlaintextsCompanion(
          owner: Value(_owner),
          id: Value(id),
          conversationId: Value(conversationId),
          payload: Value(payload),
          createdAt: Value(DateTime.now()),
        ),
      );

  @override
  Future<Map<String, (String, String)>> all() async => {
        for (final r in await _db.e2eePlaintextsAll(_owner))
          r.id: (r.conversationId, r.payload),
      };
}

/// The signed-in account's end-to-end encryption (null signed out).
final e2eeServiceProvider = Provider<E2eeService?>((ref) {
  final owner = ref.watch(currentUserIdProvider);
  if (owner == null) {
    ChatMappers.e2eeOpen = null;
    return null;
  }
  final service = E2eeService(
    client: api.E2eeClient(ref.watch(dioProvider)),
    ownerId: owner,
    plaintexts: DbE2eePlaintextStore(ref.watch(cacheDatabaseProvider), owner),
    openEngine: MlsEngine.open,
    // PR 4: encrypted files and the backup go up as ciphertext only (no
    // scan: the server cannot read them; a reported file is scanned then).
    upload: (bytes, purpose) => StorageUploader.dio(
      ref.read(dioProvider),
      ref.read(storageDioProvider),
    ).upload(
      purpose: purpose,
      body: UploadBody.bytes(bytes),
      mime: 'application/vnd.lawbid.e2ee',
      filename: 'e2ee.bin',
    ),
    download: (url) async {
      final r = await ref.read(storageDioProvider).get<List<int>>(
            url,
            options: Options(responseType: ResponseType.bytes),
          );
      return Uint8List.fromList(r.data ?? const []);
    },
  );
  ChatMappers.e2eeOpen = service.openCached;
  // PR 4: the players and image loaders read encrypted files locally.
  E2eeMedia.resolve = (id) => E2eeService.mediaOf(id, service.download!);
  ref.onDispose(() {
    if (ChatMappers.e2eeOpen == service.openCached) ChatMappers.e2eeOpen = null;
    E2eeMedia.resolve = null;
    E2eeMedia.clear();
  });
  return service;
});
