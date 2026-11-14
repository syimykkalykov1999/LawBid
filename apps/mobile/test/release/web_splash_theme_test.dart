import 'dart:io';
import 'dart:ui' show Color;

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/tokens/app_colors.dart';

/// Owner 13.11 (row 93): lawbid.dev's splash is in the app's theme colour
/// (dark when the system is dark, or the theme picked in the app), not
/// always white — and those colours are the app's own tokens.
void main() {
  String hex(Color c) {
    final rgb = (c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0');
    return '#${rgb.toUpperCase()}';
  }

  final html = File('web/index.html').readAsStringSync();
  final head = File('web/boot_head.js').readAsStringSync();

  test('the splash and the page take --boot-bg, else the system colour', () {
    expect(
      html,
      contains('html, body { margin: 0; height: 100%; '
          'background: var(--boot-bg, var(--boot-default)); }'),
    );
    expect(html, contains('background: var(--boot-bg, var(--boot-default));'));
    expect(
      html,
      contains(':root { --boot-default: ${hex(AppColorsLight.bg)}; }'),
    );
    expect(
      html,
      contains('@media (prefers-color-scheme: dark) '
          '{ :root { --boot-default: ${hex(AppColorsDark.bg)}; } }'),
    );
    // No fixed white left on the splash.
    expect(html, isNot(contains('background: #fff')));
  });

  test('a theme picked in the app colours the splash from the first paint', () {
    expect(head, contains("day: { bg: '${hex(AppColorsLight.bg)}' }"));
    expect(head, contains("night: { bg: '${hex(AppColorsDark.bg)}' }"));
    expect(head, contains("blue: { bg: '${hex(AppColorsBlue.bg)}'"));
    expect(head, contains("green: { bg: '${hex(AppColorsGreen.bg)}'"));
    expect(head, contains("s.setProperty('--boot-bg', t.bg);"));
  });
}
