import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';

const _lastKey = 'contacts_auto_sync_at_v1';
const _knownKey = 'contacts_known_ids_v1';
const _notifyKey = 'contacts_notify_new_v1';

/// How often the phone book is read again without the user asking.
const contactsAutoSyncEvery = Duration(hours: 24);

/// Owner 2026-10-20 (like WhatsApp): once the user has allowed contacts
/// sync, the app re-syncs by itself at start and once a day, and says
/// "X is now on LawBid" when a person from the phone book appears. Never
/// asks for the permission on its own: only runs after the user allowed it
/// on this install and while the sync is on.
class ContactsBackgroundSync with WidgetsBindingObserver {
  ContactsBackgroundSync(this._ref);

  final Ref _ref;
  bool _started = false;
  bool _running = false;

  /// Runs now and again whenever the app comes back to the foreground
  /// (the 24 h gate decides whether it does anything).
  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _ref.onDispose(() => WidgetsBinding.instance.removeObserver(this));
    unawaited(run());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(run());
  }

  bool get notifyNew =>
      _ref.read(localKvStoreProvider).getString(_notifyKey) != '0';

  Future<void> setNotifyNew({required bool on}) =>
      _ref.read(localKvStoreProvider).setString(_notifyKey, on ? '1' : '0');

  bool _due() {
    final raw = _ref.read(localKvStoreProvider).getString(_lastKey);
    final last = raw == null ? null : DateTime.tryParse(raw);
    return last == null ||
        DateTime.now().difference(last) >= contactsAutoSyncEvery;
  }

  /// One pass; swallows every error (it is a background job).
  Future<void> run() async {
    if (_running) return;
    _running = true;
    try {
      final actions = _ref.read(contactsSyncActionsProvider);
      if (!actions.asked || !_due()) return;
      final status = await _ref.read(contactsSyncStatusProvider.future);
      if (!status.enabled) return;
      final kv = _ref.read(localKvStoreProvider);
      await kv.setString(_lastKey, DateTime.now().toIso8601String());
      final data = await _ref.refresh(phoneContactsProvider.future);
      if (data.denied) return;
      final known = {
        for (final id in (jsonDecode(kv.getString(_knownKey) ?? '[]') as List))
          '$id',
      };
      final now = {for (final c in data.onLawBid) c.userId: c};
      await kv.setString(_knownKey, jsonEncode(now.keys.toList()));
      // The first pass on this install only learns who is there.
      if (known.isEmpty || !notifyNew) return;
      final fresh = [
        for (final e in now.entries)
          if (!known.contains(e.key)) e.value,
      ];
      if (fresh.isNotEmpty) await _announce(fresh);
    } on Object {
      // Offline, rate-limited, permission taken away: try at the next start.
    } finally {
      _running = false;
    }
  }

  Future<void> _announce(List<LawBidContact> fresh) async {
    final t = _ref.read(translatorProvider);
    final body = fresh.length == 1
        ? t.t('phoneContacts.joined', {'name': fresh.first.title})
        : t.t('phoneContacts.joinedMany', {'count': '${fresh.length}'});
    final shown =
        await _ref.read(systemNotificationsProvider).showTest('LawBid', body);
    // iOS has no local channel here: the open app says it instead.
    if (!shown) {
      rootMessengerKey.currentState
          ?.showSnackBar(SnackBar(content: Text(body)));
    }
  }
}

final contactsBackgroundSyncProvider = Provider<ContactsBackgroundSync>(
  ContactsBackgroundSync.new,
);
