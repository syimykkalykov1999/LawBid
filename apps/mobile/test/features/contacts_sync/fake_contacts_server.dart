import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_book.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';

/// Owner 2026-10-22: the server's hash-checked contacts sync, in memory
/// (the same rules as apps/api ContactsSyncService.sync).
class FakeContactsServer implements ContactsSyncRepository {
  FakeContactsServer({Map<String, ContactPerson>? users, this.region = 'US'})
      : users = {...?users};

  /// Registered people by the hash of their number.
  final Map<String, ContactPerson> users;
  final String? region;

  Set<String> stored = {};
  String? hash;
  int version = 0;

  /// Every POST /contacts/sync body.
  final calls = <Map<String, Object?>>[];

  /// Thrown by the next sync calls, in order.
  final errors = <ApiException>[];

  /// Answers 403 to a body with more than this many hashes (the firewall).
  int? firewallMax;

  /// Answers 429 from this call number on (1-based).
  int? limitFrom;

  List<String> get uploadedHashes => [
        for (final c in calls) ...(c['added'] as List<String>? ?? const []),
      ];

  List<ContactPerson> get _people => [
        for (final h in stored)
          if (users[h] case final ContactPerson p) p,
      ];

  @override
  Future<ContactsSyncStatus> status() async => ContactsSyncStatus(
        enabled: true,
        matches: _people.length,
        phoneRegion: region,
      );

  @override
  Future<ContactsSyncAnswer> sync({
    bool full = false,
    String? baseHash,
    List<String> added = const [],
    List<String> removed = const [],
    String? bookHash,
    int? matchesVersion,
  }) async {
    calls.add({
      'full': full,
      'baseHash': baseHash,
      'added': added,
      'removed': removed,
      'bookHash': bookHash,
      'matchesVersion': matchesVersion,
    });
    if (firewallMax != null && added.length + removed.length > firewallMax!) {
      throw const ApiException(
        code: 'FORBIDDEN',
        message: 'firewall',
        statusCode: 403,
      );
    }
    if (limitFrom != null && calls.length >= limitFrom!) {
      throw const ApiException(
        code: 'RATE_LIMITED',
        message: 'limit',
        statusCode: 429,
      );
    }
    if (errors.isNotEmpty) throw errors.removeAt(0);
    ContactsSyncAnswer answer(ContactsSyncStatusCode s) => ContactsSyncAnswer(
          status: s,
          bookHash: hash,
          bookSize: stored.length,
          matchesVersion: version,
          people: s == ContactsSyncStatusCode.ok ? _people : const [],
        );
    if (!full && added.isEmpty && removed.isEmpty) {
      if (hash == null || hash != bookHash) {
        return answer(ContactsSyncStatusCode.resync);
      }
      if (matchesVersion == version) {
        return answer(ContactsSyncStatusCode.notModified);
      }
      return answer(ContactsSyncStatusCode.ok);
    }
    if (!full && (hash == null || hash != baseHash)) {
      return answer(ContactsSyncStatusCode.resync);
    }
    if (full) {
      stored = {...added};
    } else {
      stored
        ..removeAll(removed)
        ..addAll(added);
    }
    hash = bookHashOf(stored);
    return answer(ContactsSyncStatusCode.ok);
  }

  @override
  Future<ContactsUploadResult> upload(
    Set<String> hashes, {
    ContactsUploadProgress? onProgress,
  }) async =>
      throw UnimplementedError('old builds only');

  @override
  Future<void> remove() async {
    stored = {};
    hash = null;
  }

  @override
  Future<void> setFindByPhone({required bool enabled}) async {}

  bool? notifyJoined;

  @override
  Future<void> setNotifyJoined({required bool enabled}) async {
    notifyJoined = enabled;
  }
}
