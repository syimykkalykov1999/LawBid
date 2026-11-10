import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_picker_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/features/contacts_sync/application/contacts_picker_web.dart'
    as impl;
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart'
    show PhoneBookEntry;

/// B-c2 (c), 2026-11-09: the site's Contacts tab. A browser never hands a
/// page the whole address book; the one standard way is the Contact Picker
/// API (W3C, `navigator.contacts.select`; Chrome on Android since 80, not
/// desktop browsers, not Safari/Firefox — MDN 2025): the person picks the
/// people in the phone's own sheet and the page gets only those names and
/// numbers. The rest of the tab is the phone's: hashes on the device, the
/// same sync, the same rows. Where the browser has no picker the tab says
/// so (the «Доступно в приложении» text it showed before).
abstract interface class ContactsPicker {
  /// Whether this browser has the picker.
  bool get supported;

  /// Opens the picker; null when the person closed it or the browser said
  /// no. Must be called right in the tap's handler (the browser needs the
  /// gesture).
  Future<List<PhoneBookEntry>?> pick();
}

/// The browser's picker on the web, null on the phones (they read the
/// whole book with flutter_contacts).
final contactsPickerProvider = Provider<ContactsPicker?>(
  (_) => kIsWeb ? impl.createContactsPicker() : null,
);

/// What the person picked in this tab (kept in memory only: a shared
/// computer keeps no names of anyone's contacts); null before the first pick.
class PickedContacts extends Notifier<List<PhoneBookEntry>?> {
  @override
  List<PhoneBookEntry>? build() => null;

  // ignore: use_setters_to_change_properties
  void set(List<PhoneBookEntry> entries) => state = entries;
}

final pickedContactsProvider =
    NotifierProvider<PickedContacts, List<PhoneBookEntry>?>(
  PickedContacts.new,
);

/// The picker's answer as phone-book entries: the first name of each
/// contact, its numbers; contacts without a number are dropped.
List<PhoneBookEntry> entriesFromPicked(
  Iterable<({List<String> names, List<String> numbers})> picked,
) =>
    [
      for (final c in picked)
        if (c.numbers.any((n) => n.trim().isNotEmpty))
          PhoneBookEntry(
            name: c.names
                .map((n) => n.trim())
                .firstWhere((n) => n.isNotEmpty, orElse: () => ''),
            numbers: [
              for (final n in c.numbers)
                if (n.trim().isNotEmpty) n.trim(),
            ],
          ),
    ];
