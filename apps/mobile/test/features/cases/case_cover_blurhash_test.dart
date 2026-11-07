import 'package:flutter/material.dart';
import 'package:flutter_blurhash/flutter_blurhash.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/compact_case_row.dart';
import 'package:lawbid/features/mine/presentation/widgets/mine_grid.dart';

/// R-248 (owner 2026-10-23: «как в инсте с брифами с кейсами в лентах и в
/// профилях»): a case's cover never opens as an empty grey box — its
/// BlurHash is drawn until the picture is decoded, as in the feed.
const _hash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
const _url = 'https://cdn.test/cover-320.jpg';

Widget _app(Widget child) => MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Center(child: SizedBox(width: 360, height: 200, child: child)),
      ),
    );

void main() {
  for (final hash in [_hash, null]) {
    final expected = hash == null ? findsNothing : findsOneWidget;

    testWidgets('Mine grid tile while loading (hash: ${hash != null})',
        (tester) async {
      await tester.pumpWidget(
        _app(
          MineTile(
            data: MineTileData(
              title: 'Speeding ticket',
              statusLabel: 'Open',
              statusTone: StatusTone.info,
              onTap: () {},
              coverUrl: _url,
              coverBlurhash: hash,
            ),
          ),
        ),
      );
      expect(find.byType(BlurHash), expected);
    });

    testWidgets('case row while loading (hash: ${hash != null})',
        (tester) async {
      await tester.pumpWidget(
        _app(
          CompactCaseRow(
            title: 'Speeding ticket',
            status: const Text('Open'),
            onTap: () {},
            coverUrl: _url,
            coverBlurhash: hash,
          ),
        ),
      );
      expect(find.byType(BlurHash), expected);
    });
  }
}
