import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show compute, kIsWeb;
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// One phone-book entry: the name and its raw numbers.
class PhoneBookEntry {
  const PhoneBookEntry({required this.name, required this.numbers});

  final String name;
  final List<String> numbers;
}

/// Phone-book entries, or null when the user did not allow access.
/// Replaceable in tests.
typedef PhoneBookEntriesReader = Future<List<PhoneBookEntry>?> Function();

Future<List<PhoneBookEntry>?> readPhoneBookEntries() async {
  if (kIsWeb) return null;
  if (!await FlutterContacts.requestPermission(readonly: true)) return null;
  final contacts = await FlutterContacts.getContacts(withProperties: true);
  return [
    for (final c in contacts)
      if (c.phones.isNotEmpty)
        PhoneBookEntry(
          name: c.displayName.trim(),
          numbers: [for (final p in c.phones) p.number],
        ),
  ];
}

final phoneBookEntriesReaderProvider =
    Provider<PhoneBookEntriesReader>((_) => readPhoneBookEntries);

/// A phone-book person who has a LawBid account. Owner 2026-10-20 (like
/// WhatsApp): shown under the name saved in the phone.
class LawBidContact {
  const LawBidContact({
    required this.person,
    required this.phoneName,
  });

  final ContactPerson person;

  /// The name in the phone book (falls back to the LawBid name).
  final String phoneName;

  String get userId => person.userId;
  String get title => phoneName.isEmpty ? person.displayName : phoneName;
}

/// A phone-book person who is not on LawBid yet — to invite.
class InvitableContact {
  const InvitableContact({required this.name, required this.number});

  final String name;

  /// The first raw number (to open the share sheet / SMS composer).
  final String number;
}

class PhoneContacts {
  const PhoneContacts({
    this.onLawBid = const [],
    this.invite = const [],
    this.denied = false,
    this.needsConsent = false,
    this.limited = false,
    this.matchFailed = false,
  });

  final List<LawBidContact> onLawBid;
  final List<InvitableContact> invite;

  /// The user did not allow access to the phone book.
  final bool denied;

  /// Sync is off: nothing is read or sent until the person says yes.
  final bool needsConsent;

  /// The daily limit stopped the upload; what is shown is what was synced
  /// so far and the rest follows tomorrow.
  final bool limited;

  /// The phone book was read but asking the server who is on LawBid failed
  /// (offline, server error): [invite] is the whole book, [onLawBid] what
  /// was known before, and the request is tried again quietly.
  final bool matchFailed;
}

/// "Find people from your contacts?" answered yes in this session (the
/// server's `enabled` is only set by the first upload).
class ContactsConsent extends Notifier<bool> {
  @override
  bool build() => false;

  void grant() => state = true;
}

final contactsConsentProvider =
    NotifierProvider<ContactsConsent, bool>(ContactsConsent.new);

const _cacheKey = 'contacts_cache_v1';

/// How long the device remembers who matched; inside it only numbers not
/// seen before are sent.
const contactsCacheTtl = Duration(hours: 24);

class _Cache {
  const _Cache(this.at, this.region, this.hashes, this.people);

  final DateTime at;
  final String? region;
  final Set<String> hashes;
  final List<ContactPerson> people;

  bool get fresh => DateTime.now().difference(at) < contactsCacheTtl;

  String encode() => jsonEncode({
        'at': at.toIso8601String(),
        'region': region,
        'hashes': hashes.toList(),
        'people': [
          for (final p in people)
            {
              'hash': p.hash,
              'userId': p.userId,
              'displayName': p.displayName,
              'username': p.username,
              'avatarUrl': p.avatarUrl,
              'role': p.role,
            },
        ],
      });

  static _Cache? decode(String? raw) {
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return _Cache(
        DateTime.parse(m['at'] as String),
        m['region'] as String?,
        {for (final h in m['hashes'] as List) '$h'},
        [
          for (final raw in m['people'] as List)
            ContactPerson(
              hash: (raw as Map)['hash'] as String,
              userId: raw['userId'] as String,
              displayName: raw['displayName'] as String? ?? '',
              username: raw['username'] as String?,
              avatarUrl: raw['avatarUrl'] as String?,
              role: raw['role'] as String?,
            ),
        ],
      );
    } on Object {
      return null;
    }
  }
}

/// What can be shown while the book is being matched: the phone book with
/// the people known so far (from the device cache, then from each answer).
/// Null when nothing is in progress. Owner 2026-10-22: the Contacts tab
/// shows the phone book at once instead of a spinner until the server
/// answers.
class PhoneContactsLive extends Notifier<PhoneContacts?> {
  @override
  PhoneContacts? build() => null;

  // ignore: use_setters_to_change_properties
  void show(PhoneContacts? value) => state = value;
}

final phoneContactsLiveProvider =
    NotifierProvider<PhoneContactsLive, PhoneContacts?>(PhoneContactsLive.new);

/// What the Contacts tab and the picker show: the answer, or — while it is
/// on its way — the phone book with the people known so far.
AsyncValue<PhoneContacts> watchPhoneContacts(WidgetRef ref) {
  final value = ref.watch(phoneContactsProvider);
  final live = ref.watch(phoneContactsLiveProvider);
  if (value.isLoading && !value.hasValue && live != null) {
    return AsyncData(live);
  }
  return value;
}

/// After a failed match request the phone book stays on screen and the
/// request is tried again, quietly, after these delays (then on the next
/// open or pull-to-refresh). Replaceable in tests.
final contactsRetryDelaysProvider = Provider<List<Duration>>(
  (_) => const [
    Duration(seconds: 10),
    Duration(seconds: 30),
    Duration(minutes: 2),
  ],
);

class _Retries {
  int count = 0;
}

final _retriesProvider = Provider<_Retries>((_) => _Retries());

/// The rows of the Contacts tab: [people] on LawBid under their phone-book
/// names, everyone else of the book to invite.
PhoneContacts _view(
  List<PhoneBookEntry> entries,
  Map<String, int> byHash,
  Iterable<ContactPerson> people, {
  bool limited = false,
  bool matchFailed = false,
}) {
  final seen = <String>{};
  final onLawBid = <LawBidContact>[];
  final matchedEntries = <int>{};
  for (final p in people) {
    if (!seen.add(p.userId)) continue;
    final index = byHash[p.hash];
    if (index != null) matchedEntries.add(index);
    onLawBid.add(
      LawBidContact(
        person: p,
        phoneName: index == null ? '' : entries[index].name,
      ),
    );
  }
  onLawBid.sort(
    (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
  );
  final invite = <InvitableContact>[
    for (var i = 0; i < entries.length; i++)
      if (entries[i].name.isNotEmpty && !matchedEntries.contains(i))
        InvitableContact(
          name: entries[i].name,
          number: entries[i].numbers.first,
        ),
  ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return PhoneContacts(
    onLawBid: onLawBid,
    invite: invite,
    limited: limited,
    matchFailed: matchFailed,
  );
}

/// Reads the phone book, hashes the numbers on the device (off the main
/// thread), uploads only the hashes and joins the answer back to the names.
/// Nothing is read or sent before the person said yes. The result is kept on
/// the device for a day: inside it only new numbers are uploaded, after it
/// the book is synced again; a 429 keeps what was already received.
///
/// Owner 2026-10-22: the whole book goes up in one request (parts only when
/// the firewall refuses it, see ApiContactsSyncRepository); the book is on
/// screen (phoneContactsLiveProvider) before the answer, and a failed
/// answer never empties the tab — the book stays, with the people known
/// before, and the request is retried quietly.
final phoneContactsProvider = FutureProvider<PhoneContacts>((ref) async {
  final actions = ref.read(contactsSyncActionsProvider);
  final kv = ref.read(localKvStoreProvider);
  final cache = _Cache.decode(kv.getString(_cacheKey));
  ContactsSyncStatus? status;
  try {
    status = await ref.read(contactsSyncStatusProvider.future);
  } on ApiException {
    // Offline: a person who allowed contacts on this install still sees
    // the phone book.
    if (!actions.asked) rethrow;
  }
  if (status != null &&
      !status.enabled &&
      !ref.watch(contactsConsentProvider)) {
    return const PhoneContacts(needsConsent: true);
  }
  final entries = await ref.read(phoneBookEntriesReaderProvider)();
  if (entries == null) return const PhoneContacts(denied: true);
  // Allowed on this install: the daily background sync may run from now on.
  await actions.markAsked();
  final region = status?.phoneRegion ?? cache?.region;
  final byHash = await compute(
    hashPhoneBook,
    (numbers: [for (final e in entries) e.numbers], region: region),
  );
  final reuse = cache != null && cache.fresh && cache.region == region;
  final all = byHash.keys.toSet();
  final todo = reuse ? all.difference(cache.hashes) : all;
  // Known before this pass: on screen at once, replaced by the answer.
  final known = <String, ContactPerson>{
    if (cache != null && cache.region == region)
      for (final p in cache.people) p.userId: p,
  };
  final live = ref.read(phoneContactsLiveProvider.notifier)
    ..show(_view(entries, byHash, known.values));

  // People received in this pass.
  final received = <String, ContactPerson>{};
  final uploaded = <String>{if (reuse) ...cache.hashes};
  var limited = false;
  final retries = ref.read(_retriesProvider);
  if (todo.isNotEmpty) {
    try {
      final res = await ref.read(contactsSyncRepositoryProvider).upload(
            todo,
            onProgress: (soFar) => live.show(
              _view(
                entries,
                byHash,
                {
                  ...known,
                  for (final p in soFar.people) p.userId: p,
                }.values,
              ),
            ),
          );
      uploaded.addAll(res.uploaded);
      for (final p in res.people) {
        received[p.userId] = p;
      }
      limited = res.limited;
    } on ApiException {
      // The book stays on screen with the people known before; the
      // request is tried again quietly. The cache is left as it was.
      final delays = ref.read(contactsRetryDelaysProvider);
      if (retries.count < delays.length) {
        final timer = Timer(delays[retries.count++], ref.invalidateSelf);
        ref.onDispose(timer.cancel);
      }
      live.show(null);
      return _view(entries, byHash, known.values, matchFailed: true);
    }
  }
  retries.count = 0;
  // A full pass replaces the list (people who went away disappear); inside
  // the day, or when a limit cut the pass short, the old list is kept.
  final kept = <String, ContactPerson>{
    if (cache != null && (reuse || limited))
      for (final p in cache.people) p.userId: p,
    ...received,
  };
  await kv.setString(
    _cacheKey,
    _Cache(
      limited
          ? (cache?.at ?? DateTime(2000))
          : (reuse ? cache.at : DateTime.now()),
      region,
      uploaded,
      kept.values.toList(),
    ).encode(),
  );
  ref
    ..invalidate(contactsSyncStatusProvider)
    ..invalidate(suggestionsProvider);
  live.show(null);
  return _view(entries, byHash, kept.values, limited: limited);
});
