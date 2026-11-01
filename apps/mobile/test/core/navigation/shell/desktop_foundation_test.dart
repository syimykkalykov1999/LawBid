import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_side_nav.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/chat/presentation/desktop_chats.dart';

import '../../../helpers/ux_harness.dart';

/// Desktop web plan 2026-10-28, PR 1: the desktop foundation switches on
/// only in the web layout on a window ≥ 1024; a phone-sized window (and the
/// app, where the web layout is off) gets every widget back as it was.
void main() {
  tearDown(() => adaptiveShellOverride = null);

  Future<void> pump(WidgetTester t, Widget child, Size size) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    adaptiveShellOverride = true;
    await t.pumpWidget(
      uxApp(
        Scaffold(body: child),
        theme: AppTheme.light(),
        size: size,
        overrides: uxOverrides(),
      ),
    );
    await t.pump();
  }

  group('windowClassFor', () {
    test('the thresholds 600 / 840 / 1024 / 1440', () {
      expect(windowClassFor(599, adaptive: true), WindowClass.phone);
      expect(windowClassFor(600, adaptive: true), WindowClass.tablet);
      expect(windowClassFor(840, adaptive: true), WindowClass.tabletWide);
      expect(windowClassFor(1023, adaptive: true), WindowClass.tabletWide);
      expect(windowClassFor(1024, adaptive: true), WindowClass.desktop);
      expect(windowClassFor(1439, adaptive: true), WindowClass.desktop);
      expect(windowClassFor(1440, adaptive: true), WindowClass.desktopWide);
    });

    test('the app (no web layout) is a phone at any width', () {
      expect(windowClassFor(1920, adaptive: false), WindowClass.phone);
    });

    test('the existing menu thresholds are unchanged', () {
      expect(shellLayoutFor(1500, adaptive: true), ShellLayout.extendedRail);
      expect(shellLayoutFor(700, adaptive: true), ShellLayout.rail);
    });
  });

  testWidgets('390×844 with the web flag on: every desktop widget is a no-op',
      (t) async {
    const page = SizedBox.expand(key: Key('page'));
    var sent = 0;
    await pump(
      t,
      Column(
        children: [
          const Expanded(
            child: ListDetailLayout(
              list: Text('list'),
              detail: HoverSurface(child: ReadableWidth(child: page)),
            ),
          ),
          DesktopSendOnEnter(
            onSend: () => sent++,
            child: const TextField(key: Key('field')),
          ),
          const ChatsAdaptivePage(phone: Text('phone-page')),
        ],
      ),
      const Size(390, 844),
    );
    expect(find.text('list'), findsNothing);
    expect(t.getSize(find.byKey(const Key('page'))).width, 390);
    expect(
      find.descendant(
        of: find.byType(HoverSurface),
        matching: find.byType(MouseRegion),
      ),
      findsNothing,
    );
    expect(find.text('phone-page'), findsOneWidget);
    await t.tap(find.byKey(const Key('field')));
    await t.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(sent, 0);
  });

  testWidgets('tablet 900: the menu has no desktop items', (t) async {
    await pump(
      t,
      const WebPageFrame(location: '/inbox', child: SizedBox.expand()),
      const Size(900, 700),
    );
    expect(find.byType(AppSideNav), findsOneWidget);
    expect(find.byKey(const ValueKey('side-nav-messages')), findsNothing);
  });

  testWidgets(
      'desktop 1440: Messages and Notifications in the menu; chats take the '
      'whole width next to the narrow menu', (t) async {
    await pump(
      t,
      const WebPageFrame(
        location: '/inbox',
        child: SizedBox.expand(key: Key('page')),
      ),
      const Size(1440, 900),
    );
    expect(find.byKey(const ValueKey('side-nav-messages')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('side-nav-notifications')),
      findsOneWidget,
    );
    expect(t.getSize(find.byType(AppSideNav)).width, 76);
    expect(t.getSize(find.byKey(const Key('page'))).width, 1440 - 76);

    // Any other page keeps the 680 column and the menu with names.
    await pump(
      t,
      const WebPageFrame(
        location: '/profile/settings',
        child: SizedBox.expand(key: Key('page')),
      ),
      const Size(1440, 900),
    );
    expect(t.getSize(find.byType(AppSideNav)).width, 220);
    expect(t.getSize(find.byKey(const Key('page'))).width, 680);
  });

  testWidgets('list | detail: 360 list (400 from 1440), the rest the detail',
      (t) async {
    const layout = ListDetailLayout(
      list: SizedBox.expand(key: Key('list')),
      detail: SizedBox.expand(key: Key('detail')),
    );
    await pump(t, layout, const Size(1280, 800));
    expect(t.getSize(find.byKey(const Key('list'))).width, 360);
    expect(t.getSize(find.byKey(const Key('detail'))).width, 1280 - 361);
    await pump(t, layout, const Size(1440, 900));
    expect(t.getSize(find.byKey(const Key('list'))).width, 400);
  });

  testWidgets('supporting pane: only from 1280', (t) async {
    const layout = SupportingPaneLayout(
      main: SizedBox.expand(key: Key('main')),
      pane: SizedBox.expand(key: Key('pane')),
    );
    await pump(t, layout, const Size(1100, 800));
    expect(find.byKey(const Key('pane')), findsNothing);
    await pump(t, layout, const Size(1440, 900));
    expect(t.getSize(find.byKey(const Key('pane'))).width, 320);
  });

  testWidgets('a sheet is a dialog on desktop, a bottom sheet on a phone',
      (t) async {
    for (final (size, dialog) in [
      (const Size(1440, 900), true),
      (const Size(390, 844), false),
    ]) {
      await pump(
        t,
        Builder(
          builder: (context) => TextButton(
            onPressed: () => showAppBottomSheet<void>(
              context: context,
              builder: (_) => const Column(
                mainAxisSize: MainAxisSize.min,
                children: [AppSheetHandle(), Text('sheet body')],
              ),
            ),
            child: const Text('open'),
          ),
        ),
        size,
      );
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      expect(find.text('sheet body'), findsOneWidget);
      expect(find.byType(DesktopSheetDialog), dialog ? findsOne : findsNothing);
      expect(find.byType(BottomSheet), dialog ? findsNothing : findsOne);
      // Esc closes the window (the desktop's dialog).
      if (dialog) {
        await t.sendKeyEvent(LogicalKeyboardKey.escape);
        await t.pumpAndSettle();
        expect(find.text('sheet body'), findsNothing);
      }
    }
  });

  testWidgets('desktop scroll bars', (t) async {
    await pump(
      t,
      ScrollConfiguration(
        behavior: const AppScrollBehavior(),
        child: ListView(children: const [SizedBox(height: 3000)]),
      ),
      const Size(1440, 900),
    );
    expect(find.byType(Scrollbar), findsOneWidget);
  });

  group('keys', () {
    testWidgets('message field: Enter sends, Shift+Enter does not, Esc asks',
        (t) async {
      var sent = 0;
      var escapes = 0;
      await pump(
        t,
        DesktopSendOnEnter(
          onSend: () => sent++,
          onEscape: () {
            escapes++;
            return true;
          },
          child: const TextField(key: Key('field'), maxLines: 5),
        ),
        const Size(1440, 900),
      );
      await t.tap(find.byKey(const Key('field')));
      await t.pump();
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      expect(sent, 1);
      await t.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.enter);
      await t.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      expect(sent, 1);
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      expect(escapes, 1);
    });

    testWidgets('Ctrl/⌘+K, Esc and Alt+↑/↓ go to the screen on top', (t) async {
      var fallback = 0;
      var search = 0;
      final steps = <int>[];
      var escapes = 0;
      await pump(
        t,
        DesktopShortcuts(
          onSearch: () => fallback++,
          child: Focus(
            autofocus: true,
            child: DesktopKeyBindings(
              onSearch: () => search++,
              onEscape: () {
                escapes++;
                return true;
              },
              onStep: steps.add,
              child: const SizedBox.expand(),
            ),
          ),
        ),
        const Size(1440, 900),
      );
      await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyK);
      await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await t.sendKeyDownEvent(LogicalKeyboardKey.metaLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyK);
      await t.sendKeyUpEvent(LogicalKeyboardKey.metaLeft);
      expect((search, fallback), (2, 0));
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      expect(escapes, 1);
      await t.sendKeyDownEvent(LogicalKeyboardKey.altLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await t.sendKeyEvent(LogicalKeyboardKey.arrowUp);
      await t.sendKeyUpEvent(LogicalKeyboardKey.altLeft);
      expect(steps, [1, -1]);
    });

    testWidgets('Ctrl+K with no screen search opens the Search tab', (t) async {
      var fallback = 0;
      await pump(
        t,
        DesktopShortcuts(
          onSearch: () => fallback++,
          child: const Focus(autofocus: true, child: SizedBox.expand()),
        ),
        const Size(1440, 900),
      );
      await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyK);
      await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      expect(fallback, 1);
    });

    testWidgets('a phone window ignores the desktop keys', (t) async {
      var fallback = 0;
      await pump(
        t,
        DesktopShortcuts(
          onSearch: () => fallback++,
          child: const Focus(autofocus: true, child: SizedBox.expand()),
        ),
        const Size(390, 844),
      );
      await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyK);
      await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      expect(fallback, 0);
    });
  });
}
