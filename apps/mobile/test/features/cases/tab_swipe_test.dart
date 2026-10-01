import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';

enum _T { a, b, c }

void main() {
  Future<ValueNotifier<_T>> pump(WidgetTester tester) async {
    final tab = ValueNotifier(_T.a);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ValueListenableBuilder<_T>(
          valueListenable: tab,
          builder: (context, value, _) => TabSwipe<_T>(
            value: value,
            values: _T.values,
            onChanged: (v) => tab.value = v,
            child: SizedBox.expand(child: Center(child: Text(value.name))),
          ),
        ),
      ),
    ));
    return tab;
  }

  testWidgets('swipe left → next section, swipe right → previous',
      (tester) async {
    final tab = await pump(tester);
    await tester.flingFrom(const Offset(300, 300), const Offset(-200, 0), 800);
    await tester.pumpAndSettle();
    expect(tab.value, _T.b);
    await tester.flingFrom(const Offset(300, 300), const Offset(-200, 0), 800);
    await tester.pumpAndSettle();
    expect(tab.value, _T.c);
    // The last section stays put.
    await tester.flingFrom(const Offset(300, 300), const Offset(-200, 0), 800);
    await tester.pumpAndSettle();
    expect(tab.value, _T.c);
    await tester.flingFrom(const Offset(100, 300), const Offset(200, 0), 800);
    await tester.pumpAndSettle();
    expect(tab.value, _T.b);
  });

  testWidgets('a swipe from the left edge is "back", not a section switch',
      (tester) async {
    final tab = await pump(tester);
    tab.value = _T.b;
    await tester.pump();
    await tester.flingFrom(const Offset(5, 300), const Offset(250, 0), 800);
    await tester.pumpAndSettle();
    expect(tab.value, _T.b);
  });

  testWidgets('a short slow drag does nothing', (tester) async {
    final tab = await pump(tester);
    await tester.dragFrom(const Offset(300, 300), const Offset(-40, 0));
    await tester.pumpAndSettle();
    expect(tab.value, _T.a);
  });
}
