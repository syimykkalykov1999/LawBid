import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/web_lifecycle.dart';

void main() {
  late DateTime clock;
  late WebLifecycleBus bus;

  setUp(() {
    clock = DateTime(2026, 10, 23, 12);
    bus = WebLifecycleBus(now: () => clock);
  });

  tearDown(() => bus.dispose());

  test('a tab switch reports how long the page was away', () async {
    final seen = <WebLifecycleEvent>[];
    bus.events.listen(seen.add);

    bus.report(WebLifecycleKind.hidden);
    expect(bus.isVisible, isFalse);
    clock = clock.add(const Duration(seconds: 3));
    bus.report(WebLifecycleKind.visible);
    await Future<void>.delayed(Duration.zero);

    expect(bus.isVisible, isTrue);
    expect(seen.map((e) => e.kind), [
      WebLifecycleKind.hidden,
      WebLifecycleKind.visible,
    ]);
    expect(seen.last.awayFor, const Duration(seconds: 3));
    expect(seen.last.isComingBack, isTrue);
    expect(seen.first.isComingBack, isFalse);
  });

  test('away time runs from the first hide even if freeze follows', () async {
    final seen = <WebLifecycleEvent>[];
    bus.events.listen(seen.add);

    bus.report(WebLifecycleKind.pageHide);
    clock = clock.add(const Duration(minutes: 2));
    bus.report(WebLifecycleKind.freeze);
    clock = clock.add(const Duration(minutes: 3));
    bus.report(WebLifecycleKind.resume);
    await Future<void>.delayed(Duration.zero);

    expect(seen.last.awayFor, const Duration(minutes: 5));
  });

  test('offline then online reports the outage', () async {
    final seen = <WebLifecycleEvent>[];
    bus.events.listen(seen.add);

    bus.report(WebLifecycleKind.offline);
    expect(bus.isOnline, isFalse);
    clock = clock.add(const Duration(seconds: 40));
    bus.report(WebLifecycleKind.online);
    await Future<void>.delayed(Duration.zero);

    expect(bus.isOnline, isTrue);
    expect(seen.last.awayFor, const Duration(seconds: 40));
  });

  test('settling is true only for a few seconds after the page came back', () {
    expect(bus.settling, isFalse);
    bus.report(WebLifecycleKind.hidden);
    expect(bus.settling, isFalse);
    bus.report(WebLifecycleKind.visible);
    expect(bus.settling, isTrue);
    clock =
        clock.add(WebLifecycleBus.settleWindow + const Duration(seconds: 1));
    expect(bus.settling, isFalse);
  });

  test('off the browser attach does nothing and the page counts as visible',
      () {
    WebLifecycle.attach();
    expect(WebLifecycle.isVisible, isTrue);
    expect(WebLifecycle.isOnline, isTrue);
  });
}
