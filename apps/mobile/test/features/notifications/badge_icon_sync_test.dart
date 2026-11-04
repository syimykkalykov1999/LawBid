import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// R-379 (owner 2026-11-04, Samsung): the launcher icon showed «2» while
/// nothing was unread in the app. One number everywhere: the icon follows
/// the server's total on every change, on resume and on sign-out, and once
/// nothing is unread the alerts left in the shade go (One UI counts them).
class _Repo implements NotificationsRepository {
  Badges next = const Badges(chats: 2);
  int reads = 0;

  @override
  Future<Badges> badges() async {
    reads++;
    return next;
  }

  @override
  Future<NotificationSettings> settings() async =>
      const NotificationSettings(categories: []);

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

class _User extends Notifier<String?> {
  @override
  String? build() => 'u1';

  // ignore: use_setters_to_change_properties
  void set(String? id) => state = id;
}

final _user = NotifierProvider<_User, String?>(_User.new);

final _icon = <int>[];
final _native = <String>[];

void _mockChannels() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
    ..setMockMethodCallHandler(const MethodChannel('app_badge_plus'),
        (call) async {
      if (call.method == 'isSupported') return true;
      if (call.method == 'updateBadge') {
        _icon.add((call.arguments as Map)['count'] as int);
      }
      return null;
    })
    ..setMockMethodCallHandler(
      const MethodChannel('lawbid/chat_notifications'),
      (call) async {
        _native.add(call.method);
        return null;
      },
    );
}

Future<void> _settle(WidgetTester t) async {
  for (var i = 0; i < 5; i++) {
    await t.pump(const Duration(milliseconds: 10));
  }
}

/// The phone's own order: to the background and back on the screen.
void _awayAndBack(WidgetTester t) {
  for (final s in const [
    AppLifecycleState.inactive,
    AppLifecycleState.hidden,
    AppLifecycleState.paused,
    AppLifecycleState.hidden,
    AppLifecycleState.inactive,
    AppLifecycleState.resumed,
  ]) {
    t.binding.handleAppLifecycleStateChanged(s);
  }
}

void main() {
  late _Repo repo;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer c;

  // Inside each test body (its fake clock runs the providers' microtasks).
  void start(WidgetTester t) {
    _icon.clear();
    _native.clear();
    _mockChannels();
    repo = _Repo();
    events = StreamController<RealtimeEvent>.broadcast();
    c = ProviderContainer(
      overrides: [
        notificationsRepositoryProvider.overrideWithValue(repo),
        currentUserIdProvider.overrideWith((ref) => ref.watch(_user)),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await events.close();
    });
    c.listen(badgesProvider, (_, __) {});
  }

  testWidgets(
      'a read that leaves nothing unread clears the icon and the '
      'shade', (t) async {
    start(t);
    await _settle(t);
    expect(_icon.last, 2);
    expect(_native, isNot(contains('clearDelivered')));

    // The chat was read (here or on another device): the server's number.
    events.add(
      const RealtimeEvent('badge:update', {
        'chatsUnread': 0,
        'notificationsUnread': 0,
      }),
    );
    await _settle(t);
    expect(c.read(badgesProvider).total, 0);
    expect(_icon.last, 0);
    expect(_native.where((m) => m == 'clearDelivered'), hasLength(1));

    // Still nothing unread: the shade is not cleared again per event.
    events.add(
      const RealtimeEvent('badge:update', {
        'chatsUnread': 0,
        'notificationsUnread': 0,
      }),
    );
    await _settle(t);
    expect(_native.where((m) => m == 'clearDelivered'), hasLength(1));

    // Something new arrives: the icon follows, nothing is cleared.
    events.add(
      const RealtimeEvent('badge:update', {
        'chatsUnread': 1,
        'notificationsUnread': 1,
      }),
    );
    await _settle(t);
    expect(_icon.last, 2);
    expect(_native.where((m) => m == 'clearDelivered'), hasLength(1));
  });

  testWidgets(
      'back on the screen: the server number is re-read and, with '
      'nothing unread, the leftover alerts go', (t) async {
    start(t);
    await _settle(t);
    expect(_icon.last, 2);
    final before = repo.reads;

    // Read elsewhere while the app slept.
    repo.next = const Badges();
    _awayAndBack(t);
    await _settle(t);
    expect(repo.reads, before + 1);
    expect(_icon.last, 0);
    expect(_native, contains('clearDelivered'));

    // Every resume with nothing unread clears again (pushes may have come
    // in the background).
    _native.clear();
    _awayAndBack(t);
    await _settle(t);
    expect(_native, contains('clearDelivered'));
  });

  testWidgets('sign-out puts 0 on the icon', (t) async {
    start(t);
    await _settle(t);
    expect(_icon.last, 2);
    c.read(_user.notifier).set(null);
    await _settle(t);
    expect(c.read(badgesProvider).total, 0);
    expect(_icon.last, 0);
  });
}
