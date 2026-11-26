import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/core/platform/system_data_saver.dart';

class _FakeSource implements SystemDataSaverSource {
  _FakeSource({required this.now});

  bool now;
  final controller = StreamController<bool>.broadcast();

  @override
  Future<bool> current() async => now;

  @override
  Stream<bool> get changes => controller.stream;
}

/// G9 (25.11): the data saver follows the phone's own switch (iOS Low Data
/// Mode, Android Data Saver, the browser's saveData).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  ProviderContainer containerWith(_FakeSource source) {
    final c = ProviderContainer(
      overrides: [systemDataSaverSourceProvider.overrideWithValue(source)],
    );
    addTearDown(c.dispose);
    addTearDown(source.controller.close);
    return c;
  }

  test(
    'the phone already in Low Data Mode / Data Saver: on at start',
    () async {
      final c = containerWith(_FakeSource(now: true));
      expect(
        c.read(dataSaverProvider),
        isFalse,
      ); // first frame, before the answer
      await pumpEventQueue();
      expect(c.read(dataSaverProvider), isTrue);
    },
  );

  test('the person flips the phone switch while the app runs', () async {
    final source = _FakeSource(now: false);
    final c = containerWith(source)..listen(dataSaverProvider, (_, __) {});
    await pumpEventQueue();
    expect(c.read(dataSaverProvider), isFalse);
    source.controller.add(true);
    await pumpEventQueue();
    expect(c.read(dataSaverProvider), isTrue);
    source.controller.add(false);
    await pumpEventQueue();
    expect(c.read(dataSaverProvider), isFalse);
  });

  test('an explicit choice wins over the system signal', () async {
    final source = _FakeSource(now: true);
    final c = containerWith(source)..listen(dataSaverProvider, (_, __) {});
    await pumpEventQueue();
    c.read(dataSaverProvider.notifier).set(on: false);
    source.controller.add(true);
    await pumpEventQueue();
    expect(c.read(dataSaverProvider), isFalse);
  });

  test('no platform handler (tests, desktop): off, never an error', () async {
    const source = PlatformDataSaverSource();
    expect(await source.current(), isFalse);
    final events = <bool>[];
    final sub = source.changes.listen(events.add);
    await pumpEventQueue();
    await sub.cancel();
    expect(events, isEmpty);
  });
}
