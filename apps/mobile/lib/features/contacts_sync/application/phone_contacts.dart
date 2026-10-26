import 'dart:async';

import 'package:flutter/foundation.dart' show compute, kIsWeb;
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_book_sync.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';

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
  // Owner 2026-10-22 (WhatsApp): a message push from a contact shows the
  // name saved in the phone book. Kept on the phone only (the system's
  // notification code reads it); never uploaded.
  unawaited(
    chatNotificationsChannel.setContactNames(
      contactNamesForPush([
        for (final c in onLawBid) (userId: c.userId, phoneName: c.phoneName),
      ]),
    ),
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
/// thread), syncs only hashes and joins the answer back to the names.
/// Nothing is read or sent before the person said yes.
///
/// Owner 2026-10-22: the book is on screen (phoneContactsLiveProvider)
/// before the answer, and a failed answer never empties the tab — the book
/// stays, with the people known before, and the request is retried
/// quietly. The sync itself is hash-checked and sends only changes
/// (ContactsBookSync): an unchanged book costs one tiny "changed?" request
/// at most once an hour; the device keeps the people list between runs.
final phoneContactsProvider = FutureProvider<PhoneContacts>((ref) async {
  final actions = ref.read(contactsSyncActionsProvider);
  final bookSync = ref.read(contactsBookSyncProvider);
  final saved = bookSync.saved;
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
  final region = status?.phoneRegion ?? saved?.region;
  final byHash = await compute(
    hashPhoneBook,
    (numbers: [for (final e in entries) e.numbers], region: region),
  );
  // Known before this pass: on screen at once, replaced by the answer.
  final known = saved != null && saved.region == region
      ? saved.people
      : const <ContactPerson>[];
  final live = ref.read(phoneContactsLiveProvider.notifier)
    ..show(_view(entries, byHash, known));
  final retries = ref.read(_retriesProvider);
  final ContactsBookSyncResult res;
  try {
    res = await bookSync.sync(
      byHash.keys.toSet(),
      region: region,
      onProgress: (soFar) => live.show(_view(entries, byHash, soFar)),
    );
  } on ApiException {
    // The book stays on screen with the people known before; the request
    // is tried again quietly.
    final delays = ref.read(contactsRetryDelaysProvider);
    if (retries.count < delays.length) {
      final timer = Timer(delays[retries.count++], ref.invalidateSelf);
      ref.onDispose(timer.cancel);
    }
    live.show(null);
    return _view(entries, byHash, known, matchFailed: true);
  }
  retries.count = 0;
  live.show(null);
  return _view(entries, byHash, res.people, limited: res.limited);
});
