import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';

/// Bug 2026-11-08 (prod, Samsung, light theme): every notification showed a
/// plain navy square — the glyph was drawn in `iconTint`, which on the light
/// theme is the same navy as the medallion. The glyph must be visible on the
/// navy tile in every theme, and every server type must map to a Phosphor
/// glyph (const, so release icon tree-shaking keeps it).

/// Every value of `enum NotificationType` in the API's Prisma schema.
List<String> _serverTypes() {
  final schema = File('../api/prisma/schema.prisma').readAsStringSync();
  final body = RegExp(r'enum NotificationType \{([^}]*)\}')
      .firstMatch(schema)!
      .group(1)!;
  return [
    for (final line in body.split('\n'))
      if (RegExp(r'^\s*([a-z_]+)\s*$').firstMatch(line.split('//').first)
          case final m?)
        m.group(1)!,
  ];
}

double _contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

AppNotification _n(String type, NotifCategory c, {String id = 'n'}) =>
    AppNotification(
      id: id,
      type: type,
      category: c,
      payload: const {},
      aggregateCount: 1,
      createdAt: DateTime.now(),
    );

class _Repo implements NotificationsRepository {
  _Repo(this.items);

  final List<AppNotification> items;

  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async {
    if (readingFromPhoneOnly) throw StateError(kNoPhoneCopy);
    return CursorPage(items: items);
  }

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

void main() {
  setUpAll(initializeDateFormatting);

  test('every server notification type maps to a Phosphor glyph', () {
    final types = _serverTypes();
    expect(types.length, greaterThan(50));
    expect(types, contains('missed_call'));
    for (final type in types) {
      for (final c in NotifCategory.values) {
        final icon = notificationIcon(_n(type, c));
        expect(
          icon.fontFamily,
          anyOf(AppIcons.boldFamily, AppIcons.fillFamily),
          reason: type,
        );
        expect(icon.codePoint, greaterThan(0), reason: type);
      }
    }
  });

  test('the glyph ink on a navy tile is readable in every theme', () {
    for (final id in AppThemeId.values) {
      final c = AppTheme.of(id).extension<AppColorTokens>()!;
      expect(
        _contrast(c.onNavy, c.navy),
        greaterThanOrEqualTo(4.5),
        reason: '$id',
      );
    }
  });

  for (final id in AppThemeId.values) {
    testWidgets('notification glyphs are not navy-on-navy ($id)',
        (tester) async {
      final repo = _Repo([
        _n('missed_call', NotifCategory.calls, id: 'a'),
        _n('new_case', NotifCategory.newCases, id: 'b'),
        _n('security_new_device', NotifCategory.system, id: 'c'),
        _n('bid_accepted', NotifCategory.bids, id: 'd'),
        _n('subscription_status', NotifCategory.system, id: 'e'),
      ]);
      await tester.pumpWidget(
        uxApp(
          const Scaffold(body: NotificationsView()),
          theme: AppTheme.of(id),
          overrides: uxOverrides(
            extra: [notificationsRepositoryProvider.overrideWithValue(repo)],
          ),
        ),
      );
      await tester.pumpAndSettle();
      final navy = AppTheme.of(id).extension<AppColorTokens>()!.navy;
      final glyphs = [
        for (final e in find.byType(Icon).evaluate())
          if (e.findAncestorWidgetOfExactType<Container>()?.decoration
              case BoxDecoration(color: final fill?) when fill == navy)
            e.widget as Icon,
      ];
      expect(glyphs.length, 5);
      for (final icon in glyphs) {
        expect(icon.icon, isNotNull);
        expect(
          _contrast(icon.color!, navy),
          greaterThanOrEqualTo(4.5),
          reason: '${icon.icon} drawn in ${icon.color} on navy',
        );
      }
    });
  }
}
