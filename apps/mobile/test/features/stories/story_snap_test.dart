import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/stories/domain/story_snap.dart';

/// Owner 2026-10-21 (Instagram story editor): stickers snap to the centre,
/// the safe edges and a straight angle; far from a line nothing moves.
void main() {
  const frame = Size(360, 640);

  test('near the centre it sits exactly on both centre lines', () {
    final s = snapStoryTransform(
      x: 0.5 + 5 / 360,
      y: 0.5 - 6 / 640,
      rotation: 0,
      frame: frame,
    );
    expect(s.x, 0.5);
    expect(s.y, 0.5);
    expect(s.guides, {StoryGuide.centerX, StoryGuide.centerY});
  });

  test('far from every line nothing changes and no guide shows', () {
    final s = snapStoryTransform(
      x: 0.3,
      y: 0.7,
      rotation: 0.5,
      frame: frame,
      half: const Size(20, 20),
    );
    expect(s.x, 0.3);
    expect(s.y, 0.7);
    expect(s.rotation, 0.5);
    expect(s.guides, isEmpty);
  });

  test('the sticker edge snaps to the safe inset (5 %)', () {
    // Left edge at 18 + 3 px: within 8 px of the 18 px inset.
    const half = Size(40, 30);
    final left = snapStoryTransform(
      x: (18 + 3 + 40) / 360,
      y: 0.3,
      rotation: 0,
      frame: frame,
      half: half,
    );
    expect(left.x * 360, closeTo(18 + 40, 1e-9));
    expect(left.guides, {StoryGuide.left});

    final bottom = snapStoryTransform(
      x: 0.3,
      y: (640 - 32 - 30 + 4) / 640,
      rotation: 0,
      frame: frame,
      half: half,
    );
    expect(bottom.y * 640, closeTo(640 - 32 - 30, 1e-9));
    expect(bottom.guides, {StoryGuide.bottom});
  });

  test('the nearest line wins when two are in reach', () {
    // A wide sticker: its right edge line and the centre are both near.
    final s = snapStoryTransform(
      x: (180 + 2) / 360,
      y: 0.2,
      rotation: 0,
      frame: frame,
      half: const Size(157, 10),
    );
    expect(s.x, 0.5);
    expect(s.guides, {StoryGuide.centerX});
  });

  test('a turn within 4° goes straight, with the level guide', () {
    final near0 = snapStoryTransform(
      x: 0.3,
      y: 0.3,
      rotation: 3 * math.pi / 180,
      frame: frame,
    );
    expect(near0.rotation, 0);
    expect(near0.guides, {StoryGuide.angle});

    final near90 = snapStoryTransform(
      x: 0.3,
      y: 0.3,
      rotation: -math.pi / 2 + 0.05,
      frame: frame,
    );
    expect(near90.rotation, closeTo(-math.pi / 2, 1e-12));

    final off = snapStoryTransform(
      x: 0.3,
      y: 0.3,
      rotation: 10 * math.pi / 180,
      frame: frame,
    );
    expect(off.rotation, 10 * math.pi / 180);
    expect(off.guides, isEmpty);
  });

  test('a sticker never turned shows no level guide', () {
    final s = snapStoryTransform(x: 0.3, y: 0.3, rotation: 0, frame: frame);
    expect(s.guides, isEmpty);
  });
}
