import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_book.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Inside this time an unchanged book is not even checked with the server
/// (opening the Contacts tab again and again costs nothing).
const contactsCheckEvery = Duration(hours: 1);

/// The outcome of one sync of the phone book.
class ContactsBookSyncResult {
  const ContactsBookSyncResult({required this.people, this.limited = false});

  /// Everyone of the book on LawBid (the server's whole list).
  final List<ContactPerson> people;

  /// The server's limit (429) stopped the upload part-way; [people] is
  /// what is known so far, the rest goes next time.
  final bool limited;
}

/// Called with the people known so far after each part of a big upload.
typedef ContactsBookProgress = void Function(List<ContactPerson> soFar);

/// Owner 2026-10-22 («нельзя ни в коем случае нагружать сервер», like
/// Telegram's contacts hash and WhatsApp's delta sync): the device keeps
/// the hashes the server has, with the server's book hash
/// (ContactsBookState, per account). A sync is then:
/// - nothing at all when the book did not change in the last hour;
/// - a "changed?" check (`bookHash` alone) when it did not change —
///   `not_modified` keeps the list on the device;
/// - only the numbers added / removed when it changed;
/// - the whole book once: the first time, or when the server says
///   `resync` (another device, a reinstall, an old build in between).
/// Big changes go in parts of [maxPerRequest] (each on the previous
/// answer's hash, saved after every part so an interrupted upload resumes
/// as a delta); parts of [fallbackPartSize] when the firewall refuses a
/// big body (403 / 413).
class ContactsBookSync {
  ContactsBookSync(this._ref);

  final Ref _ref;

  static const maxPerRequest = 10000;
  static const fallbackPartSize = 100;

  /// Set after the firewall refused a big body: small parts from then on.
  bool _smallParts = false;

  String get _key {
    final me = _ref.read(currentUserIdProvider);
    return me == null ? 'contacts_book_v1' : 'contacts_book_v1.$me';
  }

  /// What the device knows (for the screen before the answer).
  ContactsBookState? get saved =>
      ContactsBookState.decode(_ref.read(localKvStoreProvider).getString(_key));

  Future<void> _save(ContactsBookState s) =>
      _ref.read(localKvStoreProvider).setString(_key, s.encode());

  /// Forgets the device's copy (the sync was turned off).
  Future<void> forget() => _ref.read(localKvStoreProvider).remove(_key);

  /// Syncs [phoneBook] (SHA-256 hashes of E.164 numbers hashed with [region]).
  /// Throws ApiException except 429, which is [ContactsBookSyncResult.limited].
  Future<ContactsBookSyncResult> sync(
    Set<String> phoneBook, {
    String? region,
    ContactsBookProgress? onProgress,
    DateTime? now,
  }) async {
    final at = now ?? DateTime.now();
    final book = capBook(phoneBook);
    var state = saved;
    if (state != null && state.region != region) state = null;
    final repo = _ref.read(contactsSyncRepositoryProvider);
    try {
      if (state != null && state.serverHash != null) {
        final added = book.difference(state.hashes);
        final removed = state.hashes.difference(book);
        if (added.isEmpty && removed.isEmpty) {
          final checked = state.checkedAt;
          if (checked != null && at.difference(checked) < contactsCheckEvery) {
            return ContactsBookSyncResult(people: state.people);
          }
          final ans = await repo.sync(
            bookHash: state.serverHash,
            matchesVersion: state.version,
          );
          switch (ans.status) {
            case ContactsSyncStatusCode.notModified:
              await _save(state.copyWith(checkedAt: at));
              return ContactsBookSyncResult(people: state.people);
            case ContactsSyncStatusCode.ok:
              final next = state.copyWith(
                people: ans.people,
                version: ans.matchesVersion,
                checkedAt: at,
              );
              await _save(next);
              _changed();
              return ContactsBookSyncResult(people: next.people);
            case ContactsSyncStatusCode.resync:
              break;
          }
        } else {
          final done = await _send(
            book,
            state,
            removed: removed.toList(),
            added: added.toList(),
            at: at,
            onProgress: onProgress,
          );
          if (done != null) return done;
        }
      }
      // The whole book: the first time, or after `resync`.
      final fresh = ContactsBookState(
        serverHash: null,
        hashes: const {},
        people: state?.people ?? const [],
        version: state?.version ?? 0,
        region: region,
      );
      return (await _send(
        book,
        fresh,
        added: book.toList(),
        full: true,
        at: at,
        onProgress: onProgress,
      ))!;
    } on ApiException catch (e) {
      if (e.statusCode != 429) rethrow;
      return ContactsBookSyncResult(
        people: saved?.people ?? state?.people ?? const [],
        limited: true,
      );
    }
  }

  /// Sends the changes in parts; null when the server asked for the whole
  /// book (`resync`).
  Future<ContactsBookSyncResult?> _send(
    Set<String> book,
    ContactsBookState start, {
    required List<String> added,
    required DateTime at,
    List<String> removed = const [],
    bool full = false,
    ContactsBookProgress? onProgress,
  }) async {
    final repo = _ref.read(contactsSyncRepositoryProvider);
    final expected = bookHashOf(book);
    var state = start;
    var first = full;
    var r = 0;
    var a = 0;
    var size = _smallParts ? fallbackPartSize : maxPerRequest;
    while (first || r < removed.length || a < added.length) {
      final rPart = removed.sublist(r, math.min(r + size, removed.length));
      final aPart = added.sublist(
        a,
        math.min(a + size - rPart.length, added.length),
      );
      final last =
          r + rPart.length >= removed.length &&
          a + aPart.length >= added.length;
      final ContactsSyncAnswer ans;
      try {
        ans = await repo.sync(
          full: first,
          baseHash: first ? null : state.serverHash,
          added: aPart,
          removed: rPart,
          bookHash: last ? expected : null,
        );
      } on ApiException catch (e) {
        final firewall = e.statusCode == 403 || e.statusCode == 413;
        if (firewall && size > fallbackPartSize) {
          _smallParts = true;
          size = fallbackPartSize;
          continue;
        }
        rethrow;
      }
      if (ans.status == ContactsSyncStatusCode.resync) return null;
      first = false;
      r += rPart.length;
      a += aPart.length;
      state = state.copyWith(
        serverHash: ans.bookHash,
        hashes: state.hashes.difference(rPart.toSet()).union(aPart.toSet()),
        people: ans.people,
        version: ans.matchesVersion,
        checkedAt: at,
      );
      await _save(state);
      onProgress?.call(ans.people);
    }
    // The server's book is not what this device thinks: the whole book
    // goes next time.
    if (state.serverHash != expected) {
      state = state.copyWith(clearServerHash: true);
      await _save(state);
    }
    _changed();
    return ContactsBookSyncResult(people: state.people);
  }

  void _changed() {
    _ref
      ..invalidate(contactsSyncStatusProvider)
      ..invalidate(suggestionsProvider);
  }
}

final contactsBookSyncProvider = Provider<ContactsBookSync>(
  ContactsBookSync.new,
);
