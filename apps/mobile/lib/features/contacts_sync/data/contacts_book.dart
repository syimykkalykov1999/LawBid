import 'dart:convert';

import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';

/// Owner 2026-10-22: most numbers synced per account — the same cap as
/// the server's CONTACT_BOOK_MAX. A bigger book sends the first ones in
/// sorted order, so the choice is the same on every run.
const contactBookMax = 20000;

/// The hash of a whole book: the XOR of its SHA-256 hashes (64 hex), the
/// same as the server's (apps/api/src/modules/contacts-sync/
/// contacts-book-hash.ts). Order-free, empty book = 64 zeros.
String bookHashOf(Iterable<String> hashes) {
  final acc = List<int>.filled(32, 0);
  for (final h in hashes) {
    for (var i = 0; i < 32; i++) {
      acc[i] ^= int.parse(h.substring(i * 2, i * 2 + 2), radix: 16);
    }
  }
  final out = StringBuffer();
  for (final b in acc) {
    out.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return out.toString();
}

/// [book] within [contactBookMax].
Set<String> capBook(Set<String> book) {
  if (book.length <= contactBookMax) return book;
  return (book.toList()..sort()).take(contactBookMax).toSet();
}

/// What the device remembers of the last sync (hashes only, never numbers
/// or names), per account: the book the server has, its hash, the people
/// list and its version. Owner 2026-10-22: with it the daily sync is a
/// "changed?" check, and a changed book sends only the difference.
class ContactsBookState {
  const ContactsBookState({
    required this.serverHash,
    required this.hashes,
    required this.people,
    this.version = 0,
    this.region,
    this.checkedAt,
  });

  /// The server's book hash after the last answer; null = unknown (the
  /// next sync sends the book whole).
  final String? serverHash;

  /// The hashes the server has (what [serverHash] is the hash of).
  final Set<String> hashes;

  final List<ContactPerson> people;

  /// The version of [people] (the server's `matchesVersion`).
  final int version;

  /// The phone region the numbers were hashed with.
  final String? region;

  /// When the server last answered.
  final DateTime? checkedAt;

  ContactsBookState copyWith({
    String? serverHash,
    bool clearServerHash = false,
    Set<String>? hashes,
    List<ContactPerson>? people,
    int? version,
    DateTime? checkedAt,
  }) =>
      ContactsBookState(
        serverHash: clearServerHash ? null : (serverHash ?? this.serverHash),
        hashes: hashes ?? this.hashes,
        people: people ?? this.people,
        version: version ?? this.version,
        region: region,
        checkedAt: checkedAt ?? this.checkedAt,
      );

  String encode() => jsonEncode({
        'serverHash': serverHash,
        'hashes': hashes.toList(),
        'version': version,
        'region': region,
        'checkedAt': checkedAt?.toIso8601String(),
        'people': [for (final p in people) contactPersonToJson(p)],
      });

  static ContactsBookState? decode(String? raw) {
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return ContactsBookState(
        serverHash: m['serverHash'] as String?,
        hashes: {for (final h in m['hashes'] as List) '$h'},
        version: (m['version'] as num?)?.toInt() ?? 0,
        region: m['region'] as String?,
        checkedAt: DateTime.tryParse('${m['checkedAt']}'),
        people: [
          for (final raw in m['people'] as List)
            if (contactPersonFromJson(raw) case final ContactPerson p) p,
        ],
      );
    } on Object {
      return null;
    }
  }
}

Map<String, Object?> contactPersonToJson(ContactPerson p) => {
      'hash': p.hash,
      'userId': p.userId,
      'displayName': p.displayName,
      'username': p.username,
      'avatarUrl': p.avatarUrl,
      'role': p.role,
    };

ContactPerson? contactPersonFromJson(Object? raw) {
  if (raw is! Map) return null;
  final id = raw['userId'];
  final hash = raw['hash'];
  if (id is! String || hash is! String) return null;
  return ContactPerson(
    hash: hash,
    userId: id,
    displayName: (raw['displayName'] as String?) ?? '',
    username: raw['username'] as String?,
    avatarUrl: raw['avatarUrl'] as String?,
    role: raw['role'] as String?,
  );
}
