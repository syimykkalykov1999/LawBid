import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';

/// Owner 2026-10-20 (Samsung, Arabic): the lit segment of «Chats | Team'
/// sat on the wrong one — it was placed from the physical left while the row
/// of segments mirrors in right-to-left languages.
void main() {
  for (final rtl in [false, true]) {
    for (final lit in [InboxTab.chats, InboxTab.team]) {
      testWidgets('the lit segment is under its label (rtl: $rtl, $lit)',
          (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: Directionality(
              textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
              child: Scaffold(
                body: Center(
                  child: InboxTabsBar(
                    value: lit,
                    tabs: const [
                      (InboxTab.chats, 'Chats', 0),
                      (InboxTab.team, 'Team', 0),
                    ],
                    onChanged: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final label = lit == InboxTab.chats ? 'Chats' : 'Team';
        final labelX = tester.getCenter(find.text(label)).dx;
        final colors = AppTheme.light().extension<AppColorTokens>()!;
        final lamp = find.byWidgetPredicate(
          (w) =>
              w is Container &&
              w.decoration is BoxDecoration &&
              (w.decoration! as BoxDecoration).color == colors.accent,
        );
        expect(tester.getCenter(lamp).dx, closeTo(labelX, 4));
        // Chats is the first segment: right-most in right-to-left.
        final chatsX = tester.getCenter(find.text('Chats')).dx;
        final teamX = tester.getCenter(find.text('Team')).dx;
        expect(chatsX < teamX, !rtl);
      });
    }
  }
}
