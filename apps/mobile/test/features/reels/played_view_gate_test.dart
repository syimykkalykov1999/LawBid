import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/reels/application/played_view_gate.dart';

void main() {
  test('counts after 3 s of unbroken playing, once', () {
    fakeAsync((t) {
      var n = 0;
      final g = PlayedViewGate(() => n++)..playing(value: true);
      t.elapse(const Duration(milliseconds: 2900));
      expect(n, 0);
      t.elapse(const Duration(milliseconds: 200));
      expect(n, 1);
      g
        ..playing(value: false)
        ..playing(value: true);
      t.elapse(const Duration(seconds: 10));
      expect(n, 1);
    });
  });

  test('a stop (scrolled away, paused) cancels and restarts from zero', () {
    fakeAsync((t) {
      var n = 0;
      final g = PlayedViewGate(() => n++)..playing(value: true);
      t.elapse(const Duration(seconds: 2));
      g.playing(value: false);
      t.elapse(const Duration(seconds: 5));
      expect(n, 0);
      g.playing(value: true);
      t.elapse(const Duration(seconds: 2));
      expect(n, 0);
      t.elapse(const Duration(seconds: 1));
      expect(n, 1);
    });
  });

  test('repeated playing(true) does not restart the wait; dispose cancels', () {
    fakeAsync((t) {
      var n = 0;
      final g = PlayedViewGate(() => n++)..playing(value: true);
      t.elapse(const Duration(seconds: 2));
      g.playing(value: true);
      t.elapse(const Duration(seconds: 1));
      expect(n, 1);
      PlayedViewGate(() => n++)
        ..playing(value: true)
        ..dispose();
      t.elapse(const Duration(seconds: 5));
      expect(n, 1);
    });
  });
}
