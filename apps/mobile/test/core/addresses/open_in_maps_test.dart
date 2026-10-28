import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/addresses/open_in_maps.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';

/// Owner 2026-10-28: a tapped address opens the maps chooser with the
/// address filled in for directions.
class FakeLauncher extends MapsLauncher {
  FakeLauncher({this.installed = const {}, this.opens = true});

  final Set<String> installed;
  final bool opens;
  final opened = <Uri>[];

  @override
  Future<bool> canOpen(Uri uri) async => installed.contains(uri.scheme);

  @override
  Future<bool> open(Uri uri) async {
    opened.add(uri);
    return opens;
  }
}

const _a = '12 Main St, Hays, KS 67601';
const _t = StaticTranslatorEn();

Future<void> _pumpButton(
  WidgetTester tester, {
  required TargetPlatform platform,
  bool web = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => openAddressInMaps(
              context,
              _t,
              _a,
              platform: platform,
              web: web,
            ),
            child: const Text('go'),
          ),
        ),
      ),
    ),
  );
}

void main() {
  late FakeLauncher launcher;
  tearDown(() => mapsLauncher = const MapsLauncher());

  testWidgets('Android: the system chooser of maps apps (geo:)',
      (tester) async {
    launcher = FakeLauncher();
    mapsLauncher = launcher;
    await _pumpButton(tester, platform: TargetPlatform.android);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(launcher.opened.single.scheme, 'geo');
    expect(
      Uri.decodeComponent(launcher.opened.single.query),
      'q=$_a',
    );
    expect(find.byKey(const ValueKey('maps-chooser')), findsNothing);
  });

  testWidgets('Android with nothing for geo: Google Maps in the browser',
      (tester) async {
    launcher = FakeLauncher(opens: false);
    mapsLauncher = launcher;
    await _pumpButton(tester, platform: TargetPlatform.android);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(launcher.opened.map((u) => u.scheme), ['geo', 'https']);
    expect(launcher.opened.last.queryParameters['destination'], _a);
    expect(find.text(_t.t('card.map.failed')), findsOneWidget);
  });

  testWidgets('iPhone: a sheet with the installed apps; Google gets directions',
      (tester) async {
    launcher = FakeLauncher(installed: {'comgooglemaps'});
    mapsLauncher = launcher;
    await _pumpButton(tester, platform: TargetPlatform.iOS);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('maps-chooser')), findsOneWidget);
    expect(find.byKey(const ValueKey('maps-apple')), findsOneWidget);
    expect(find.byKey(const ValueKey('maps-google')), findsOneWidget);
    expect(find.byKey(const ValueKey('maps-waze')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('maps-google')));
    await tester.pumpAndSettle();
    final u = launcher.opened.single;
    expect(u.scheme, 'comgooglemaps');
    expect(u.queryParameters['daddr'], _a);
  });

  testWidgets('iPhone: Apple Maps and Waze links', (tester) async {
    expect(MapsLinks.app(MapsApp.apple, _a).host, 'maps.apple.com');
    expect(MapsLinks.app(MapsApp.apple, _a).queryParameters['daddr'], _a);
    final waze = MapsLinks.app(MapsApp.waze, _a);
    expect(waze.host, 'waze.com');
    expect(waze.queryParameters, {'q': _a, 'navigate': 'yes'});

    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String?;
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    launcher = FakeLauncher(installed: {'waze'});
    mapsLauncher = launcher;
    await _pumpButton(tester, platform: TargetPlatform.iOS);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('maps-copy')));
    await tester.pumpAndSettle();
    expect(launcher.opened, isEmpty);
    expect(copied, _a);
    expect(find.text(_t.t('tasks.place.copied')), findsOneWidget);
  });

  testWidgets('web: Google Maps directions', (tester) async {
    launcher = FakeLauncher();
    mapsLauncher = launcher;
    await _pumpButton(tester, platform: TargetPlatform.iOS, web: true);
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(launcher.opened.single.host, 'www.google.com');
  });

  testWidgets('a chat place card: a tap on the address opens maps',
      (tester) async {
    launcher = FakeLauncher();
    mapsLauncher = launcher;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [translatorProvider.overrideWithValue(_t)],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(
            body: Center(child: PlaceCardBody(address: _a, mine: false)),
          ),
        ),
      ),
    );
    await tester.tap(find.text(_a));
    await tester.pumpAndSettle();
    expect(launcher.opened.single.scheme, 'geo');
    await tester.tap(find.text(_t.t('card.map')));
    await tester.pumpAndSettle();
    expect(launcher.opened, hasLength(2));
    debugDefaultTargetPlatformOverride = null;
  });
}
