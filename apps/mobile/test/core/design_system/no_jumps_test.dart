import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:material_ui/material_ui.dart';

/// Owner 27.11 («скачки во всех местах»): after an action nothing moves —
/// the widget has its final size from the first frame, and its neighbours
/// stay where they were. Each test measures the layout before and after
/// the action (and after the animation settles).
void main() {
  Widget app(Widget child) => MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(width: 360, child: child),
          ),
        ),
      );

  Offset below(WidgetTester tester) =>
      tester.getTopLeft(find.byKey(const ValueKey('below')));
  const marker = SizedBox(key: ValueKey('below'), height: 10, width: 10);

  testWidgets('AppTextField: focus and error do not grow the field',
      (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    Widget field({String? error}) => app(
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppTextField(
                key: const ValueKey('field'),
                controller: controller,
                errorText: error,
                maxLines: 3,
              ),
              marker,
            ],
          ),
        );
    await tester.pumpWidget(field());
    final size = tester.getSize(find.byKey(const ValueKey('field')));
    final at = below(tester);
    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    expect(tester.getSize(find.byKey(const ValueKey('field'))), size);
    expect(below(tester), at);
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    expect(below(tester), at);
  });

  testWidgets('AppChip: selecting keeps its size and the next chip still',
      (tester) async {
    Widget chips(bool on) => app(
          Row(
            children: [
              AppChip(
                key: const ValueKey('chip'),
                label: 'Divorce',
                selected: on,
                onTap: () {},
              ),
              marker,
            ],
          ),
        );
    await tester.pumpWidget(chips(false));
    final size = tester.getSize(find.byKey(const ValueKey('chip')));
    final at = below(tester);
    await tester.pumpWidget(chips(true));
    expect(tester.getSize(find.byKey(const ValueKey('chip'))), size);
    expect(below(tester), at);
  });

  testWidgets('RoleCard: picking a role does not push the next card',
      (tester) async {
    Widget cards(bool on) => app(
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              RoleCard(
                icon: AppIcons.personOutlineRounded,
                title: 'Client',
                description: 'I need a lawyer',
                isSelected: on,
                onTap: () {},
              ),
              marker,
            ],
          ),
        );
    await tester.pumpWidget(cards(false));
    final at = below(tester);
    await tester.pumpWidget(cards(true));
    await tester.pumpAndSettle();
    expect(below(tester), at);
  });

  testWidgets('AppButton: loading keeps the height of a two-line label',
      (tester) async {
    Widget button(bool loading) => app(
          SizedBox(
            width: 120,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppButton(
                  label: 'Send the offer to the client now',
                  isLoading: loading,
                  onPressed: () {},
                ),
                marker,
              ],
            ),
          ),
        );
    await tester.pumpWidget(button(false));
    final at = below(tester);
    await tester.pumpWidget(button(true));
    await tester.pump();
    expect(below(tester), at);
  });

  testWidgets('AppCounterRoll: digits are tabular and the roll never snaps',
      (tester) async {
    Widget count(int n) => app(
          Row(
            children: [
              AppCounterRoll(
                key: const ValueKey('count'),
                text: '$n',
                value: n,
                style: const TextStyle(fontSize: 13),
              ),
              marker,
            ],
          ),
        );
    double width() => tester.getSize(find.byKey(const ValueKey('count'))).width;
    await tester.pumpWidget(count(1));
    final one = width();
    await tester.pumpWidget(count(7));
    await tester.pumpAndSettle();
    // 1 → 7: the same width, the icon beside it stays.
    expect(width(), closeTo(one, 0.01));

    await tester.pumpWidget(count(9));
    await tester.pumpAndSettle();
    final nine = width();
    await tester.pumpWidget(count(10));
    // The first frame of the roll is as wide as «9» was …
    await tester.pump();
    expect(width(), closeTo(nine, 0.5));
    await tester.pumpAndSettle();
    final ten = width();
    // … and the settled «10» is as wide as the last frame of the roll.
    await tester.pumpWidget(count(9));
    await tester.pump();
    expect(width(), closeTo(ten, 0.5));
    await tester.pumpAndSettle();
    expect(width(), closeTo(nine, 0.01));
  });

  testWidgets('BoldWidthText / WidestOfText / BoldHeightText reserve room',
      (tester) async {
    Widget texts(bool on) => app(
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BoldWidthText(
                'Family law',
                key: const ValueKey('tab'),
                bold: on,
              ),
              WidestOfText(
                on ? 'Following' : 'Follow',
                key: const ValueKey('follow'),
                all: const ['Following', 'Follow'],
              ),
              SizedBox(
                width: 140,
                child: BoldHeightText(
                  'Your bid was accepted by the client today',
                  key: const ValueKey('unread'),
                  bold: on,
                ),
              ),
              marker,
            ],
          ),
        );
    Size size(String k) => tester.getSize(find.byKey(ValueKey(k)));
    await tester.pumpWidget(texts(true));
    final tab = size('tab');
    final follow = size('follow');
    final unread = size('unread');
    final at = below(tester);
    await tester.pumpWidget(texts(false));
    expect(size('tab'), tab);
    expect(size('follow'), follow);
    expect(size('unread').height, unread.height);
    expect(below(tester), at);
  });

  testWidgets('ProfileAvatar: the upload ring does not grow the photo box',
      (tester) async {
    Widget avatar(double? progress) => app(
          Row(
            children: [
              ProfileAvatar(
                key: const ValueKey('avatar'),
                size: 64,
                initials: 'AB',
                progress: progress,
              ),
              marker,
            ],
          ),
        );
    await tester.pumpWidget(avatar(null));
    final size = tester.getSize(find.byKey(const ValueKey('avatar')));
    final at = below(tester);
    await tester.pumpWidget(avatar(0.4));
    await tester.pump();
    expect(tester.getSize(find.byKey(const ValueKey('avatar'))), size);
    expect(below(tester), at);
  });

  group('AppPaginatedListView: an insert keeps the rows already there', () {
    final built = <String, int>{};
    setUp(built.clear);

    Widget list(List<String> items) => MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: AppPaginatedListView<String>(
              items: items,
              itemKey: (s) => s,
              animateChanges: true,
              rowLeading: (_, s, i) => i == 0
                  ? const SizedBox(
                      key: ValueKey('title'),
                      height: 24,
                      child: Text('Today'),
                    )
                  : null,
              itemBuilder: (_, s, __) => _Row(s, built),
              status: AppPaginationStatus.end,
              labels: const AppPaginationLabels(
                loadingMore: 'l',
                retry: 'r',
                error: 'e',
                end: '',
              ),
              onLoadMore: () {},
              onRetry: () {},
            ),
          ),
        );

    testWidgets('rows are never built again from scratch', (tester) async {
      await tester.pumpWidget(list(['a', 'b', 'c']));
      expect(built, {'a': 1, 'b': 1, 'c': 1});
      await tester.pumpWidget(list(['n', 'a', 'b', 'c']));
      await tester.pump(const Duration(milliseconds: 30));
      await tester.pumpAndSettle();
      // Before 27.11 every row on screen was made again twice (when the
      // motion began and when it ended): pictures blinked, videos restarted.
      expect(built, {'n': 1, 'a': 1, 'b': 1, 'c': 1});
      await tester.pumpWidget(list(['n', 'b', 'c']));
      await tester.pumpAndSettle();
      expect(built['b'], 1);
      expect(built['c'], 1);
    });

    testWidgets('the group title stays put when a row grows in above',
        (tester) async {
      await tester.pumpWidget(list(['a', 'b']));
      final title = tester.getTopLeft(find.text('Today'));
      await tester.pumpWidget(list(['n', 'a', 'b']));
      await tester.pump();
      expect(find.text('Today'), findsOneWidget);
      expect(tester.getTopLeft(find.text('Today')), title);
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(find.text('Today')), title);
      double y(String s) => tester.getTopLeft(find.text(s)).dy;
      expect(y('n'), lessThan(y('a')));
    });
  });
}

class _Row extends StatefulWidget {
  const _Row(this.id, this.built);

  final String id;
  final Map<String, int> built;

  @override
  State<_Row> createState() => _RowState();
}

class _RowState extends State<_Row> {
  @override
  void initState() {
    super.initState();
    widget.built[widget.id] = (widget.built[widget.id] ?? 0) + 1;
  }

  @override
  Widget build(BuildContext context) =>
      SizedBox(height: 40, child: Text(widget.id));
}
