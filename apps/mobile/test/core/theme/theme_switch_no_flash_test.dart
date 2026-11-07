import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-28 (R-112): «любую новую тему открываю — окно на
/// миллисекунды становится белым». Switching the theme the way app.dart does
/// (the same ThemeData as `theme` and `darkTheme`, the mode from the spec's
/// brightness) must never paint a colour outside the two themes' own pages:
/// every frame of the 200 ms blend stays between the old and the new page
/// colour, and the page, the surface and the text never jump to white.
void main() {
  Widget app(AppThemeId id) {
    final spec = AppThemes.of(id);
    final data = AppTheme.of(id);
    return MaterialApp(
      theme: data,
      darkTheme: data,
      themeMode:
          spec.brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
      home: Builder(
        builder: (context) => Scaffold(
          key: const ValueKey('page'),
          body: Container(
            key: const ValueKey('surface'),
            color: Theme.of(context).extension<AppColorTokens>()!.surface,
          ),
        ),
      ),
    );
  }

  Color pageColor(WidgetTester t) {
    final ctx = t.element(find.byKey(const ValueKey('page')));
    return Theme.of(ctx).scaffoldBackgroundColor;
  }

  Color surfaceColor(WidgetTester t) {
    final ctx = t.element(find.byKey(const ValueKey('surface')));
    return Theme.of(ctx).extension<AppColorTokens>()!.surface;
  }

  bool between(double v, double a, double b) =>
      v >= (a < b ? a : b) - 0.002 && v <= (a < b ? b : a) + 0.002;

  for (final from in AppThemeId.values) {
    for (final to in AppThemeId.values) {
      if (from == to) continue;
      testWidgets('${from.name} → ${to.name}: no frame outside the two themes',
          (t) async {
        await t.pumpWidget(app(from));
        await t.pumpAndSettle();
        final bg0 = pageColor(t);
        final sf0 = surfaceColor(t);
        await t.pumpWidget(app(to));
        // Sample every frame of the blend (Flutter's 200 ms theme animation).
        final frames = <(Color, Color)>[(pageColor(t), surfaceColor(t))];
        for (var i = 0; i < 16; i++) {
          await t.pump(const Duration(milliseconds: 16));
          frames.add((pageColor(t), surfaceColor(t)));
        }
        await t.pumpAndSettle();
        final bg1 = pageColor(t);
        final sf1 = surfaceColor(t);
        for (final (bg, sf) in frames) {
          for (final (v, a, b, what) in [
            (bg.r, bg0.r, bg1.r, 'page r'),
            (bg.g, bg0.g, bg1.g, 'page g'),
            (bg.b, bg0.b, bg1.b, 'page b'),
            (sf.r, sf0.r, sf1.r, 'surface r'),
            (sf.g, sf0.g, sf1.g, 'surface g'),
            (sf.b, sf0.b, sf1.b, 'surface b'),
          ]) {
            expect(
              between(v, a, b),
              isTrue,
              reason: '$what = $v is outside [$a, $b]',
            );
          }
        }
      });
    }
  }
}
