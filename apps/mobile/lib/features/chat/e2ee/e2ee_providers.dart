import 'dart:async';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/sign_out_hooks.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
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
  Future<void> remove(String id) => _db.deleteE2eePlaintext(_owner, id);

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
    // The web seals them like the MLS state (mls.js), the phones keep them
    // in the cache database (a file the OS protects).
    plaintexts: MlsEngine.sealedPlaintexts(owner) ??
        DbE2eePlaintextStore(ref.watch(cacheDatabaseProvider), owner),
    openEngine: MlsEngine.open,
    // PR 4: encrypted files and the backup go up as ciphertext only (no
    // scan: the server cannot read them; a reported file is scanned then),
    // streamed from the file the phone wrote.
    upload: (body, purpose) => StorageUploader.dio(
      ref.read(dioProvider),
      ref.read(storageDioProvider),
    ).upload(
      purpose: purpose,
      body: body,
      mime: 'application/vnd.lawbid.e2ee',
      filename: 'e2ee.bin',
    ),
    // The ciphertext as it arrives (decrypted segment by segment).
    download: (url) async* {
      final r = await ref.read(storageDioProvider).get<ResponseBody>(
            url,
            options: Options(responseType: ResponseType.stream),
          );
      final body = r.data;
      if (body != null) yield* body.stream;
    },
  );
  ChatMappers.e2eeOpen = service.openCached;
  // PR 4: the players and image loaders read encrypted files locally.
  E2eeMedia.resolve = service.mediaOf;
  ref.onDispose(() {
    if (ChatMappers.e2eeOpen == service.openCached) ChatMappers.e2eeOpen = null;
    if (E2eeMedia.resolve == service.mediaOf) E2eeMedia.resolve = null;
    E2eeMedia.clear();
    unawaited(service.close());
  });
  return service;
});

/// Item 25 (WhatsApp: a signed-out device leaves every encrypted chat): its
/// MLS keys and groups are deleted before the session is cleared, then the
/// device is signed out on the server, so it never counts against
/// chat.e2ee_max_devices. Registered by app.dart (SignOutHooks).
Future<SignOutServerCall?> e2eeSignOutHook(WidgetRef ref) async {
  final id = await ref.read(e2eeServiceProvider)?.signOutDevice();
  if (id == null) return null;
  return (Dio dio, Map<String, dynamic> extras) =>
      api.E2eeClient(dio).revokeMlsDevice(id: id, extras: extras);
}
