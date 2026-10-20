import 'package:flutter/material.dart';

/// The gradient of each text-story background key (stories.dto.ts). A
/// story's colours are the author's content, so — like a photo — they look
/// the same in every theme and for every viewer; they are not chrome.
List<Color> storyBackgroundColors(String? key) {
  Color hsl(double hue, double s, double l) =>
      HSLColor.fromAHSL(1, hue, s, l).toColor();
  return switch (key) {
    'navy' => [hsl(222, 0.55, 0.16), hsl(214, 0.62, 0.34)],
    'wine' => [hsl(345, 0.62, 0.18), hsl(352, 0.62, 0.36)],
    'forest' => [hsl(150, 0.55, 0.12), hsl(142, 0.42, 0.30)],
    'plum' => [hsl(285, 0.5, 0.18), hsl(300, 0.42, 0.38)],
    'slate' => [hsl(215, 0.14, 0.14), hsl(212, 0.16, 0.34)],
    'sunset' => [hsl(14, 0.82, 0.46), hsl(42, 0.9, 0.52)],
    'ocean' => [hsl(196, 0.8, 0.26), hsl(172, 0.62, 0.4)],
    _ => [hsl(36, 0.7, 0.3), hsl(44, 0.78, 0.5)],
  };
}

LinearGradient storyBackgroundGradient(String? key) => LinearGradient(
      begin: AlignmentDirectional.topStart,
      end: AlignmentDirectional.bottomEnd,
      colors: storyBackgroundColors(key),
    );
