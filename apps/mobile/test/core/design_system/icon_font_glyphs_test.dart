import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';

/// 2026-10-26 (smoothness P6c): the icon fonts ship whole in the app and
/// are cut down to the used glyphs by `flutter build` (icon tree shaking,
/// web and release builds: PhosphorBold 495 KB -> 16 KB, PhosphorFill
/// 449 KB -> 40 KB in the web-deploy log). A cut font keeps exactly the
/// codepoints the Dart code names, so every codepoint [AppIcons] uses must
/// exist in its font — otherwise the icon draws as an empty box.
///
/// The list of used codepoints is read from the source of `app_icons.dart`
/// (the only place that names the Phosphor families) and checked against
/// the fonts' own character maps (`cmap`).
void main() {
  final source =
      File('lib/core/design_system/icons/app_icons.dart').readAsStringSync();
  final used = <String, Set<int>>{
    AppIcons.boldFamily: {},
    AppIcons.fillFamily: {},
  };
  final pattern = RegExp(
    r'IconData\(\s*0x([0-9a-fA-F]+)\s*,\s*fontFamily:\s*(boldFamily|fillFamily)',
  );
  for (final m in pattern.allMatches(source)) {
    final family =
        m.group(2) == 'boldFamily' ? AppIcons.boldFamily : AppIcons.fillFamily;
    used[family]!.add(int.parse(m.group(1)!, radix: 16));
  }

  test('every IconData in app_icons.dart is read by the check', () {
    final all = RegExp(r'IconData\(').allMatches(source).length;
    final read = pattern.allMatches(source).length;
    expect(read, all, reason: 'an IconData the pattern does not understand');
    expect(read, greaterThan(100));
  });

  for (final (family, file) in [
    (AppIcons.boldFamily, 'assets/fonts/PhosphorBold.ttf'),
    (AppIcons.fillFamily, 'assets/fonts/PhosphorFill.ttf'),
  ]) {
    test('$family has a glyph for every codepoint the app uses', () {
      final cmap = readCmap(File(file).readAsBytesSync());
      expect(cmap, isNotEmpty);
      final missing = used[family]!.where((c) => !cmap.contains(c)).toList()
        ..sort();
      expect(
        missing.map((c) => '0x${c.toRadixString(16)}').toList(),
        isEmpty,
        reason: 'codepoints with no glyph in $file',
      );
    });
  }
}

/// The codepoints of a TrueType/OpenType font's Unicode `cmap` subtables
/// (formats 4 and 12, the ones icon fonts use).
Set<int> readCmap(Uint8List bytes) {
  final d = ByteData.sublistView(bytes);
  final tables = d.getUint16(4);
  var cmap = -1;
  for (var i = 0; i < tables; i++) {
    final rec = 12 + i * 16;
    final tag = String.fromCharCodes(bytes.sublist(rec, rec + 4));
    if (tag == 'cmap') cmap = d.getUint32(rec + 8);
  }
  if (cmap < 0) return {};
  final out = <int>{};
  final subtables = d.getUint16(cmap + 2);
  for (var i = 0; i < subtables; i++) {
    final at = cmap + d.getUint32(cmap + 4 + i * 8 + 4);
    final format = d.getUint16(at);
    if (format == 4) {
      final segX2 = d.getUint16(at + 6);
      final ends = at + 14;
      final starts = ends + segX2 + 2;
      final deltas = starts + segX2;
      final offsets = deltas + segX2;
      for (var s = 0; s < segX2 ~/ 2; s++) {
        final end = d.getUint16(ends + s * 2);
        final start = d.getUint16(starts + s * 2);
        final delta = d.getInt16(deltas + s * 2);
        final offAt = offsets + s * 2;
        final off = d.getUint16(offAt);
        for (var c = start; c <= end && c != 0xFFFF; c++) {
          int glyph;
          if (off == 0) {
            glyph = (c + delta) & 0xFFFF;
          } else {
            final g = d.getUint16(offAt + off + (c - start) * 2);
            glyph = g == 0 ? 0 : (g + delta) & 0xFFFF;
          }
          if (glyph != 0) out.add(c);
        }
      }
    } else if (format == 12) {
      final groups = d.getUint32(at + 12);
      for (var g = 0; g < groups; g++) {
        final rec = at + 16 + g * 12;
        final start = d.getUint32(rec);
        final end = d.getUint32(rec + 4);
        final firstGlyph = d.getUint32(rec + 8);
        for (var c = start; c <= end; c++) {
          if (firstGlyph + (c - start) != 0) out.add(c);
        }
      }
    }
  }
  return out;
}
