import 'dart:async';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show ChatMappers;
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
  );
  ChatMappers.e2eeOpen = service.openCached;
  ref.onDispose(() {
    if (ChatMappers.e2eeOpen == service.openCached) ChatMappers.e2eeOpen = null;
    unawaited(service.close());
  });
  return service;
});
