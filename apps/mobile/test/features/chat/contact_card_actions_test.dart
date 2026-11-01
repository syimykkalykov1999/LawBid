// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Russian with the practice name the static bundle does not carry.
class _Ru implements Translator {
  const _Ru();
  static const _ru = StaticTranslatorRu();

  @override
  String t(String key, [Map<String, String>? params]) =>
      key == 'practice.immigration'
          ? 'Иммиграционное право'
          : _ru.t(key, params);

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _ru.plural(key, count, params);
}

const _card = ContactCard(
  userId: 'u1',
  username: 'syimyk',
  displayName: 'Syimyk Kalykov',
  verified: true,
  practiceKeys: ['practice.immigration'],
  licensedStates: ['NY'],
);

Widget _app({
  required ThemeData theme,
  required Translator translator,
  required double scale,
  required Widget home,
  TextDirection dir = TextDirection.ltr,
}) =>
    ProviderScope(
      overrides: uxOverrides(translator: translator),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: theme,
        builder: (context, child) => Directionality(
          textDirection: dir,
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
              disableAnimations: true,
            ),
            child: child!,
          ),
        ),
        home: home,
      ),
    );

Widget _bubble({required bool mine}) => Builder(
      builder: (context) => Align(
        alignment: mine
            ? AlignmentDirectional.centerEnd
            : AlignmentDirectional.centerStart,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: ChatBubbleShell(
            mine: mine,
            child: ContactCardBody(card: _card, mine: mine),
          ),
        ),
      ),
    );

Widget _page(ThemeData theme) => Builder(
      builder: (context) => Scaffold(
        backgroundColor: ChatColors.of(context).wallpaper,
        body: ListView(
          children: [_bubble(mine: false), _bubble(mine: true)],
        ),
      ),
    );

void main() {
  const keys = ['profile', 'message', 'save'];

  testWidgets('three equal segments, same style, aligned, tall enough',
      (tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      _app(
        theme: AppTheme.light(),
        translator: const _Ru(),
        scale: 1,
        home: _page(AppTheme.light()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final rects = [
      for (final k in keys)
        tester.getRect(find.byKey(ValueKey('contact-action-$k')).first),
    ];
    for (final r in rects) {
      expect(r.height, greaterThanOrEqualTo(44));
      expect(r.width, closeTo(rects.first.width, 0.5));
      expect(r.top, rects.first.top);
      expect(r.height, rects.first.height);
    }
    // Icons and labels share one axis per segment and one baseline row.
    final icons = tester.widgetList<AppIcon>(
      find.descendant(
        of: find.byKey(const ValueKey('contact-action-profile')).first,
        matching: find.byType(AppIcon),
      ),
    );
    expect(icons.length, 1);
    final styles = <TextStyle?>{};
    final dys = <double>{};
    for (var i = 0; i < keys.length; i++) {
      final seg = find.byKey(ValueKey('contact-action-${keys[i]}')).first;
      final icon = find.descendant(of: seg, matching: find.byType(AppIcon));
      final text = find.descendant(of: seg, matching: find.byType(Text));
      expect(
        tester.getCenter(icon).dx,
        closeTo(rects[i].center.dx, 0.5),
      );
      expect(
        tester.getCenter(text).dx,
        closeTo(rects[i].center.dx, 0.5),
      );
      styles.add(tester.widget<Text>(text).style);
      dys.add(tester.getCenter(text).dy);
    }
    expect(styles.length, 1);
    expect(dys.length, 1);
  });

  testWidgets('every segment taps; own card has no «Message»', (tester) async {
    final taps = <String>[];
    Widget row(List<String> ids) => Scaffold(
          body: Center(
            child: SizedBox(
              width: 224,
              child: ContactActionsRow(
                fg: Colors.black,
                actions: [
                  for (final id in ids)
                    ContactActionSpec(
                      id: id,
                      label: id,
                      icon: AppIcons.person,
                      onTap: () => taps.add(id),
                    ),
                ],
              ),
            ),
          ),
        );
    await tester
        .pumpWidget(MaterialApp(theme: AppTheme.light(), home: row(keys)));
    for (final k in keys) {
      await tester.tap(find.byKey(ValueKey('contact-action-$k')));
    }
    expect(taps, keys);
    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: row(['profile', 'save'])),
    );
    final a =
        tester.getRect(find.byKey(const ValueKey('contact-action-profile')));
    final b = tester.getRect(find.byKey(const ValueKey('contact-action-save')));
    expect(a.width, closeTo(b.width, 0.5));
    expect(a.width, greaterThan(100));
  });

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };
  for (final scale in [0.85, 1.0, 1.3, 1.6]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final dark in [false, true]) {
        testWidgets(
            'no overflow or clipping ($name, x$scale, ${dark ? 'dark' : 'light'})',
            (tester) async {
          useNarrowPhone(tester);
          final theme = dark ? AppTheme.dark() : AppTheme.light();
          await tester.pumpWidget(
            _app(
              theme: theme,
              translator: t,
              scale: scale,
              dir: dir,
              home: _page(theme),
            ),
          );
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
          for (final k in keys) {
            for (final seg
                in find.byKey(ValueKey('contact-action-$k')).evaluate()) {
              final r = tester.getRect(find.byWidget(seg.widget));
              final text = find.descendant(
                of: find.byWidget(seg.widget),
                matching: find.byType(Text),
              );
              final tr = tester.getRect(text);
              expect(r.height, greaterThanOrEqualTo(44));
              // The label stays inside its own segment.
              expect(tr.left, greaterThanOrEqualTo(r.left - 0.5));
              expect(tr.right, lessThanOrEqualTo(r.right + 0.5));
            }
          }
        });
      }
    }
  }

  for (final entry
      in {'light': AppTheme.light(), 'dark': AppTheme.dark()}.entries) {
    testGoldens('contact card actions - ${entry.key}', (tester) async {
      await tester.pumpWidgetBuilder(
        Builder(
          builder: (context) => ColoredBox(
            color: ChatColors.of(context).wallpaper,
            child: SingleChildScrollView(
              child: Column(
                children: [
                  for (final scale in [1.0, 1.6])
                    Builder(
                      builder: (context) => MediaQuery(
                        data: MediaQuery.of(context).copyWith(
                          textScaler: TextScaler.linear(scale),
                        ),
                        child: Column(
                          children: [
                            _bubble(mine: false),
                            _bubble(mine: true),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        wrapper: (child) => ProviderScope(
          overrides: uxOverrides(translator: const _Ru()),
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: entry.value,
            home: Scaffold(body: child),
          ),
        ),
        surfaceSize: const Size(340, 1000),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await screenMatchesGolden(tester, 'contact_card_actions_${entry.key}');
    });
  }
}
