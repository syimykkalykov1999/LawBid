import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
  });

  final List<LawBidContact> onLawBid;
  final List<InvitableContact> invite;

  /// The user did not allow access to the phone book.
  final bool denied;
}

/// Reads the phone book, hashes the numbers on the device, uploads only
/// the hashes and joins the answer back to the names. Kept for the session
/// (the server allows a few syncs a day); `ref.invalidate` refreshes.
final phoneContactsProvider = FutureProvider<PhoneContacts>((ref) async {
  final entries = await ref.read(phoneBookEntriesReaderProvider)();
  if (entries == null) return const PhoneContacts(denied: true);
  // hash → the phone-book entry it came from
  final byHash = <String, PhoneBookEntry>{};
  for (final e in entries) {
    for (final n in e.numbers) {
      final e164 = normalizeToE164(n);
      if (e164 != null) byHash.putIfAbsent(hashE164(e164), () => e);
    }
  }
  final result = byHash.isEmpty
      ? const ContactsUploadResult(matched: 0, people: [])
      : await ref
          .read(contactsSyncRepositoryProvider)
          .upload(byHash.keys.toSet());
  ref
    ..invalidate(contactsSyncStatusProvider)
    ..invalidate(suggestionsProvider);
  final seen = <String>{};
  final onLawBid = <LawBidContact>[];
  final matchedEntries = <PhoneBookEntry>{};
  for (final p in result.people) {
    if (!seen.add(p.userId)) continue;
    final entry = byHash[p.hash];
    if (entry != null) matchedEntries.add(entry);
    onLawBid.add(LawBidContact(person: p, phoneName: entry?.name ?? ''));
  }
  onLawBid.sort(
    (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
  );
  final invite = <InvitableContact>[
    for (final e in entries)
      if (e.name.isNotEmpty && !matchedEntries.contains(e))
        InvitableContact(name: e.name, number: e.numbers.first),
  ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return PhoneContacts(onLawBid: onLawBid, invite: invite);
});
