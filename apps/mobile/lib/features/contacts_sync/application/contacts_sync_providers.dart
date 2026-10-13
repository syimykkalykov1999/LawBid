import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/data/contacts_sync_repository.dart';
import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final contactsSyncRepositoryProvider = Provider<ContactsSyncRepository>(
  (ref) => ApiContactsSyncRepository(ref.watch(dioProvider)),
);

final contactsSyncStatusProvider =
    FutureProvider.autoDispose<ContactsSyncStatus>(
  (ref) => ref.watch(contactsSyncRepositoryProvider).status(),
  retry: _noRetry,
);

/// The raw numbers of the phone book, or null when the user did not
/// allow access. Replaceable in tests.
typedef PhoneBookReader = Future<List<String>?> Function();

Future<List<String>?> readPhoneBook() async {
  if (!await FlutterContacts.requestPermission(readonly: true)) return null;
  final contacts = await FlutterContacts.getContacts(withProperties: true);
  return [
    for (final c in contacts)
      for (final p in c.phones) p.number,
  ];
}

final phoneBookReaderProvider = Provider<PhoneBookReader>((_) => readPhoneBook);

const _askedKey = 'contacts_sync_asked_v1';

/// Owner 2026-10-13: asks once, softly — the system dialog the first time
/// People opens, the row "Find people from your contacts" afterwards.
class ContactsSyncActions {
  ContactsSyncActions(this._ref);

  final Ref _ref;

  bool get asked =>
      _ref.read(localKvStoreProvider).getString(_askedKey) == '1';

  Future<void> markAsked() =>
      _ref.read(localKvStoreProvider).setString(_askedKey, '1');

  /// Reads the phone book, hashes it on the device and uploads the
  /// hashes. Returns false when access was refused. No number and no
  /// name ever leaves this method.
  Future<bool> sync() async {
    await markAsked();
    final numbers = await _ref.read(phoneBookReaderProvider)();
    if (numbers == null) return false;
    await _ref
        .read(contactsSyncRepositoryProvider)
        .upload(contactHashes(numbers));
    _ref
      ..invalidate(contactsSyncStatusProvider)
      ..invalidate(suggestionsProvider);
    return true;
  }

  Future<void> remove() async {
    await _ref.read(contactsSyncRepositoryProvider).remove();
    _ref
      ..invalidate(contactsSyncStatusProvider)
      ..invalidate(suggestionsProvider);
  }
}

final contactsSyncActionsProvider =
    Provider<ContactsSyncActions>(ContactsSyncActions.new);
