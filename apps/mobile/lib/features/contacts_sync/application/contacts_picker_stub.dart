import 'package:lawbid/features/contacts_sync/application/contacts_picker.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart'
    show PhoneBookEntry;

/// Not a browser: no picker.
ContactsPicker createContactsPicker() => _None();

class _None implements ContactsPicker {
  @override
  bool get supported => false;

  @override
  Future<List<PhoneBookEntry>?> pick() async => null;
}
