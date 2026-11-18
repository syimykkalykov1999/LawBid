import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/web_context_menu.dart';
import 'package:lawbid/core/platform/web_tab_title.dart';
import 'package:material_ui/material_ui.dart';

/// Owner row 113: on the website a right-click opens the long-press menu,
/// message / post text can be selected, and the tab title carries the
/// unread number. Phones: nothing changes.
void main() {
  tearDown(() => debugWebContextMenuOverride = null);

  Future<void> click(WidgetTester tester, Offset at, {int? buttons}) async {
    final g = await tester.startGesture(
      at,
      kind: PointerDeviceKind.mouse,
      buttons: buttons ?? kPrimaryMouseButton,
    );
    await g.up();
    await tester.pumpAndSettle();
  }

  Widget app({required VoidCallback onMenu, required VoidCallback onTap}) =>
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: WebRightClickMenu(
              onMenu: onMenu,
              child: GestureDetector(
                onTap: onTap,
                child: Container(
                  key: const ValueKey('bubble'),
                  padding: const EdgeInsets.all(24),
                  color: Colors.white,
                  child: const WebSelectableText(
                    child: Text('Hello there, counsel'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );

  Offset edge(WidgetTester tester) =>
      tester.getTopLeft(find.byKey(const ValueKey('bubble'))) +
      const Offset(4, 4);

  Offset text(WidgetTester tester) =>
      tester.getCenter(find.text('Hello there, counsel'));

  testWidgets('website: right-click on the bubble edge opens the menu',
      (tester) async {
    debugWebContextMenuOverride = true;
    var menus = 0;
    await tester.pumpWidget(app(onMenu: () => menus++, onTap: () {}));
    expect(find.byType(SelectionArea), findsOneWidget);
    await click(tester, edge(tester), buttons: kSecondaryMouseButton);
    expect(menus, 1);
  });

  testWidgets('website: right-click on the text opens the same menu',
      (tester) async {
    debugWebContextMenuOverride = true;
    var menus = 0;
    await tester.pumpWidget(app(onMenu: () => menus++, onTap: () {}));
    await click(tester, text(tester), buttons: kSecondaryMouseButton);
    expect(menus, 1);
  });

  testWidgets('website: a plain click on the bubble still reaches its tap',
      (tester) async {
    debugWebContextMenuOverride = true;
    var taps = 0;
    await tester.pumpWidget(app(onMenu: () {}, onTap: () => taps++));
    await click(tester, edge(tester));
    expect(taps, 1);
  });

  testWidgets('phones: no selection area, no right-click menu',
      (tester) async {
    debugWebContextMenuOverride = false;
    var menus = 0;
    var taps = 0;
    await tester.pumpWidget(app(onMenu: () => menus++, onTap: () => taps++));
    expect(find.byType(SelectionArea), findsNothing);
    await click(tester, text(tester), buttons: kSecondaryMouseButton);
    expect(menus, 0);
    await click(tester, text(tester));
    expect(taps, 1);
  });

  test('tab title: «(3) LawBid», just the name at zero', () {
    expect(webTabTitle('LawBid', 3), '(3) LawBid');
    expect(webTabTitle('LawBid', 0), 'LawBid');
  });
}
