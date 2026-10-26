import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';

void main() {
  ProviderContainer make() {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    return c;
  }

  test('1:1: a tap swaps the pictures, another swaps back', () {
    final c = make();
    final n = c.read(callVideoLayoutProvider.notifier);
    expect(c.read(callVideoLayoutProvider).selfBig, isFalse);
    n.swap();
    expect(c.read(callVideoLayoutProvider).selfBig, isTrue);
    n.swap();
    expect(c.read(callVideoLayoutProvider).selfBig, isFalse);
  });

  test('group: a tap picks a person, again (or back) returns to the grid', () {
    final c = make();
    final n = c.read(callVideoLayoutProvider.notifier)..toggleFocus('u2');
    expect(c.read(callVideoLayoutProvider).focusId, 'u2');
    n.toggleFocus('u3');
    expect(c.read(callVideoLayoutProvider).focusId, 'u3');
    n.toggleFocus('u3');
    expect(c.read(callVideoLayoutProvider).focusId, isNull);
    n
      ..toggleFocus('u2')
      ..clearFocus();
    expect(c.read(callVideoLayoutProvider).focusId, isNull);
  });

  test('the small picture rests where it was dropped, can be put away', () {
    final c = make();
    final n = c.read(callVideoLayoutProvider.notifier)
      ..moveTo(PipCorner.bottomStart);
    expect(c.read(callVideoLayoutProvider).corner, PipCorner.bottomStart);
    n.hidePip();
    expect(c.read(callVideoLayoutProvider).pipHidden, isTrue);
    // A tap on the screen hides the controls, the next one shows all again.
    n.toggleControls();
    expect(c.read(callVideoLayoutProvider).controlsHidden, isTrue);
    n.toggleControls();
    final s = c.read(callVideoLayoutProvider);
    expect(s.controlsHidden, isFalse);
    expect(s.pipHidden, isFalse);
    expect(s.corner, PipCorner.bottomStart);
  });
}
