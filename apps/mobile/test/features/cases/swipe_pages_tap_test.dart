import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';

/// Owner 2026-10-20 (phone test): a tap on a tab of PillTabs + SwipePages
/// highlighted the tab but the page stayed — only a swipe turned it.
class _Host extends StatefulWidget {
  const _Host();

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  String _tab = 'a';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          PillTabs<String>(
            value: _tab,
            tabs: const [('a', 'Alpha'), ('b', 'Beta')],
            onChanged: (v) => setState(() => _tab = v),
          ),
          Expanded(
            child: SwipePages<String>(
              value: _tab,
              values: const ['a', 'b'],
              onChanged: (v) => setState(() => _tab = v),
              pageBuilder: (_, v) => Center(child: Text('page-$v')),
            ),
          ),
        ],
      );
}

void main() {
  for (final reduce in [false, true]) {
    testWidgets('a tap on a tab turns the page (reduce motion: $reduce)',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: reduce),
            child: const Scaffold(body: _Host()),
          ),
        ),
      );
      Rect rect(String text) => tester.getRect(find.text(text));
      expect(rect('page-a').center.dx, closeTo(400, 1));

      await tester.tap(find.text('Beta'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(rect('page-b').center.dx, closeTo(400, 1));

      await tester.tap(find.text('Alpha'));
      await tester.pumpAndSettle();
      expect(rect('page-a').center.dx, closeTo(400, 1));
    });
  }
}
