import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

// Per account ('<key>.<userId>'): two people on one phone, or a new login,
// never inherit each other's 24 h gate or switch.
const _lastKey = 'contacts_auto_sync_at_v1';
const _notifyKey = 'contacts_notify_new_v1';

/// How often the phone book is read again without the user asking.
const contactsAutoSyncEvery = Duration(hours: 24);

/// Owner 2026-10-20 (like WhatsApp): once the user has allowed contacts
/// sync, the app re-syncs by itself at start and once a day. Never asks for
/// the permission on its own: only runs after the user allowed it on this
/// install and while the sync is on.
///
/// Owner 2026-10-22 (like Telegram): the daily pass is a hash check —
/// nothing goes up when the book did not change, only the difference when
/// it did (ContactsBookSync). "X joined LawBid" is sent by the SERVER when
/// that person registers (push `contact_joined`), so the app no longer
/// compares lists to announce it; the «notify me» switch is stored there.
class ContactsBackgroundSync with WidgetsBindingObserver {
  ContactsBackgroundSync(this._ref);

  final Ref _ref;
  bool _started = false;
  bool _running = false;

  String _key(String base, String userId) => '$base.$userId';

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

  /// «Notify me when contacts join LawBid»: the device's copy of the
  /// server's switch (on by default).
  bool get notifyNew {
    final me = _ref.read(currentUserIdProvider);
    if (me == null) return true;
    return _ref.read(localKvStoreProvider).getString(_key(_notifyKey, me)) !=
        '0';
  }

  /// Saves the switch on the server (it sends the notice); the device's
  /// copy goes back when the server refuses.
  Future<void> setNotifyNew({required bool on}) async {
    final me = _ref.read(currentUserIdProvider);
    if (me == null) return;
    final kv = _ref.read(localKvStoreProvider);
    final before = kv.getString(_key(_notifyKey, me));
    await kv.setString(_key(_notifyKey, me), on ? '1' : '0');
    try {
      await _ref
          .read(contactsSyncRepositoryProvider)
          .setNotifyJoined(enabled: on);
    } on Object {
      if (before == null) {
        await kv.remove(_key(_notifyKey, me));
      } else {
        await kv.setString(_key(_notifyKey, me), before);
      }
      rethrow;
    }
  }

  bool _due(String me) {
    final raw = _ref.read(localKvStoreProvider).getString(_key(_lastKey, me));
    final last = raw == null ? null : DateTime.tryParse(raw);
    return last == null ||
        DateTime.now().difference(last) >= contactsAutoSyncEvery;
  }

  /// One pass; swallows every error (it is a background job).
  Future<void> run() async {
    if (_running) return;
    _running = true;
    try {
      final me = _ref.read(currentUserIdProvider);
      final actions = _ref.read(contactsSyncActionsProvider);
      if (me == null || !actions.asked || !_due(me)) return;
      final status = await _ref.read(contactsSyncStatusProvider.future);
      if (!status.enabled) return;
      final kv = _ref.read(localKvStoreProvider);
      await kv.setString(_key(_notifyKey, me), status.notifyJoined ? '1' : '0');
      final data = await _ref.refresh(phoneContactsProvider.future);
      // A pass whose request failed is tried again at the next start.
      if (data.denied || data.matchFailed) return;
      // Only after a pass that worked: a failed one is tried again soon.
      await kv.setString(_key(_lastKey, me), DateTime.now().toIso8601String());
    } on Object {
      // Offline, rate-limited, permission taken away: try at the next start.
    } finally {
      _running = false;
    }
  }
}

final contactsBackgroundSyncProvider = Provider<ContactsBackgroundSync>(
  ContactsBackgroundSync.new,
);
