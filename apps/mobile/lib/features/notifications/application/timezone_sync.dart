import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-20: the phone's time zone goes to the server at sign-in and
/// whenever it changes (a trip, a new city, the setting), because repeating
/// tasks and the daily reminders follow the person's own clock. Checked at
/// start and when the app comes back to the front; sent only when it differs
/// from what this account last sent from this phone.
class TimezoneSync with WidgetsBindingObserver {
  TimezoneSync(this._ref, this._userId);

  final Ref _ref;
  final String _userId;
  bool _busy = false;

  static String _key(String userId) => 'tz.sent.$userId';

  void start() {
    WidgetsBinding.instance.addObserver(this);
    unawaited(check());
  }

  void dispose() => WidgetsBinding.instance.removeObserver(this);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(check());
  }

  Future<void> check() async {
    if (_busy || kIsWeb) return;
    _busy = true;
    try {
      final zone = (await FlutterTimezone.getLocalTimezone()).identifier;
      if (zone.isEmpty) return;
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getString(_key(_userId)) == zone) return;
      await _ref.read(notificationsRepositoryProvider).setTimezone(zone);
      await prefs.setString(_key(_userId), zone);
    } on Object catch (e) {
      // The next start / return to the app tries again.
      debugPrint('timezone not sent: $e');
    } finally {
      _busy = false;
    }
  }
}

/// Lives with the signed-in session.
final timezoneSyncProvider = Provider<void>((ref) {
  final user = ref.watch(currentUserIdProvider);
  if (user == null) return;
  final sync = TimezoneSync(ref, user)..start();
  ref.onDispose(sync.dispose);
});
