import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/addresses/address_suggestions.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/addresses/address_field_test.dart' show FakeAddressRepo;
import '../../helpers/ux_harness.dart';

/// Owner bug 2026-11-26 (Samsung S26 Ultra, Android 16, release build):
/// «Новая публикация», the keyboard up on the place field («Los»), then ✕
/// (or back) and Settings: the bottom ~45 % of every following screen was
/// an empty band. The phone keeps reporting the keyboard height after it
/// went down (flutter/flutter#191156); [SystemNavBand] ignores that height
/// only while no field can have the keyboard.
void main() {
  setUpAll(initializeDateFormatting);

  final nav = GlobalKey<NavigatorState>();

  Widget app() => ProviderScope(
        overrides: [
          ...uxOverrides(),
          addressSuggestionsRepositoryProvider
              .overrideWithValue(FakeAddressRepo()),
        ],
        child: MaterialApp(
          navigatorKey: nav,
          theme: AppTheme.of(AppThemeId.values.first),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              viewPadding: const EdgeInsets.only(bottom: 48),
              // The phone keeps reporting the keyboard the whole time.
              viewInsets: const EdgeInsets.only(bottom: 360),
            ),
            child: SystemNavBand(child: child!),
          ),
          home: Scaffold(
            body: ListView(
              key: const Key('feed'),
              children: const [SizedBox(height: 2000)],
            ),
          ),
        ),
      );

  Future<void> openComposerAndType(WidgetTester tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    tester.view
      ..physicalSize = const Size(400, 800)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app());
    unawaited(
      nav.currentState!.push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (_) => const CreatePostScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final place = find.descendant(
      of: find.byKey(const ValueKey('post-place-field')),
      matching: find.byType(EditableText),
    );
    await tester.showKeyboard(place);
    await tester.enterText(place, 'Los');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
  }

  Future<void> openSettings(WidgetTester tester) async {
    unawaited(
      nav.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => Scaffold(
            body: ListView(
              key: const Key('settings'),
              children: const [SizedBox(height: 2000)],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  double height(WidgetTester tester, String key) =>
      tester.getSize(find.byKey(Key(key))).height;

  for (final choice in ['leave-discard', 'leave-save']) {
    testWidgets('✕, then «$choice», then Settings: full height', (
      tester,
    ) async {
      await openComposerAndType(tester);
      await tester.tap(find.byType(AppIconButton).first);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(ValueKey(choice)));
      await tester.pumpAndSettle();
      expect(height(tester, 'feed'), 800 - 48);
      await openSettings(tester);
      expect(height(tester, 'settings'), 800 - 48);
      debugDefaultTargetPlatformOverride = null;
    });
  }

  testWidgets('system back, then «discard», then Settings: full height', (
    tester,
  ) async {
    await openComposerAndType(tester);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('leave-discard')));
    await tester.pumpAndSettle();
    expect(height(tester, 'feed'), 800 - 48);
    await openSettings(tester);
    expect(height(tester, 'settings'), 800 - 48);
    debugDefaultTargetPlatformOverride = null;
  });
}
