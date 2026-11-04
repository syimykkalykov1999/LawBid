import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-11-04 (R-383, Telegram / WhatsApp): a list on the phone is
/// the truth; the server is asked only on the first open in this app run,
/// by a socket event, on pull-to-refresh or when the copy is older than its
/// window — never on a mere tab switch.
abstract final class SyncWindows {
  /// «Chats» of the contacts section (my people).
  static const chats = Duration(seconds: 60);

  /// The calls history.
  static const calls = Duration(minutes: 2);
}

/// When each list last synced with the server in this app run (memory only:
/// a cold start counts as «never», so the first open of a run syncs once).
class SyncFreshness {
  SyncFreshness({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  final _at = <String, DateTime>{};

  /// [key] synced just now.
  void mark(String key) => _at[key] = _clock();

  /// [key] must sync again (a socket event said so, or the account changed).
  void forget(String key) => _at.remove(key);

  /// Never synced in this run, or longer ago than [window].
  bool isStale(String key, Duration window) {
    final at = _at[key];
    return at == null || !_clock().isBefore(at.add(window));
  }
}

/// One clock for the app run (tests override it with a fake time).
final syncFreshnessProvider = Provider<SyncFreshness>((_) => SyncFreshness());
