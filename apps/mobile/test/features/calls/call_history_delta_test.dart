import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// B-c7 (2026-11-09): once the «Calls» list is on screen, a sync is
/// `?updatedSince=` — changed rows replace theirs, new ones join, the ids
/// in `deletedIds` leave; the first page is read again only after
/// `SYNC_TOO_OLD`. The server is never asked for the whole list twice.
CallHistoryEntry _e(String id, DateTime at, {int? sec}) => CallHistoryEntry(
      id: id,
      status: CallStatus.ended,
      outgoing: true,
      video: false,
      peer: const CallPeer(id: 'p', isAttorney: false, displayName: 'P'),
      createdAt: at,
      conversationId: 'c',
      durationSec: sec,
    );

class _Repo implements CallHistoryRepository {
  _Repo(this.first);

  List<CallHistoryEntry> first;
  int firstPages = 0;
  final sinces = <DateTime>[];
  SyncedPage<CallHistoryEntry> Function(DateTime since)? delta;

  @override
  Future<CursorPage<CallHistoryEntry>> history({
    String? cursor,
    int? limit,
  }) async {
    if (readingFromPhoneOnly) throw StateError(kNoPhoneCopy);
    firstPages++;
    return CursorPage(items: first);
  }

  @override
  Future<SyncedPage<CallHistoryEntry>> changed(DateTime since) async {
    sinces.add(since);
    final d = delta;
    if (d == null) return const SyncedPage(items: []);
    return d(since);
  }

  @override
  Future<List<OngoingGroupCall>> ongoing() async => const [];

  @override
  Future<void> hide(List<String> ids) async {}

  @override
  Future<void> clear() async {}
}

void main() {
  final t0 = DateTime(2026, 11, 9, 8);
  late StreamController<RealtimeEvent> events;
  late _Repo repo;
  late ProviderContainer c;

  setUp(() async {
    events = StreamController<RealtimeEvent>.broadcast();
    repo = _Repo([
      _e('c2', t0),
      _e('c1', t0.subtract(const Duration(hours: 1))),
    ]);
    c = ProviderContainer(
      overrides: [
        realtimeEventsProvider.overrideWithValue(events.stream),
        callHistoryRepositoryProvider.overrideWithValue(repo),
      ],
    )..listen(callHistoryProvider, (_, __) {});
    await c.read(callHistoryProvider.future);
  });

  tearDown(() async {
    c.dispose();
    await events.close();
  });

  List<String> ids() =>
      c.read(callHistoryProvider).requireValue.items.map((e) => e.id).toList();

  test('the first open reads the first page once', () {
    expect(repo.firstPages, 1);
    expect(repo.sinces, isEmpty);
    expect(ids(), ['c2', 'c1']);
  });

  test('a refresh is a delta: new join, changed replace, deleted leave',
      () async {
    final serverTime = t0.add(const Duration(minutes: 5));
    repo.delta = (_) => SyncedPage(
          items: [
            _e('c3', t0.add(const Duration(minutes: 3))), // new, on top
            _e('c1', t0.subtract(const Duration(hours: 1)), sec: 77), // changed
          ],
          deletedIds: const ['c2'],
          syncedAt: serverTime,
        );
    await c.read(callHistoryProvider.notifier).refresh();
    expect(repo.firstPages, 1, reason: 'never the whole list again');
    expect(repo.sinces, hasLength(1));
    expect(ids(), ['c3', 'c1']);
    expect(
      c.read(callHistoryProvider).requireValue.items.last.durationSec,
      77,
    );
    // The next sync starts where the server said, not at the phone's clock.
    await c.read(callHistoryProvider.notifier).refresh();
    expect(repo.sinces.last, serverTime);
  });

  test('nothing changed: the rows stay, no first page', () async {
    await c.read(callHistoryProvider.notifier).refresh();
    expect(repo.firstPages, 1);
    expect(ids(), ['c2', 'c1']);
  });

  test('SYNC_TOO_OLD → the first page again, then deltas resume', () async {
    var tooOld = true;
    repo
      ..delta = (_) {
        if (tooOld) {
          throw const ApiException(
            statusCode: 409,
            code: 'SYNC_TOO_OLD',
            message: 'reload',
          );
        }
        return const SyncedPage(items: []);
      }
      ..first = [_e('c9', t0)];
    final notifier = c.read(callHistoryProvider.notifier);
    await notifier.refresh();
    expect(repo.firstPages, 2);
    expect(ids(), ['c9']);
    tooOld = false;
    await notifier.refresh();
    expect(repo.firstPages, 2);
  });
}
