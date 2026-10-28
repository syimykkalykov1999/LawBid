import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:url_launcher/url_launcher.dart';

/// A maps app the phone may have (the links: MapsLinks).
enum MapsApp { apple, google, waze }

/// Owner 2026-10-28: the links. Directions from where the phone is now to
/// the address (the app then shows the route; the person presses Go).
abstract final class MapsLinks {
  /// Android: the system chooser of every installed maps app (Google Maps,
  /// Waze, OsmAnd…), or the person's default one.
  static Uri geo(String address) =>
      Uri.parse('geo:0,0?q=${Uri.encodeComponent(address.trim())}');

  /// Anywhere (web, no maps app): Google Maps directions in the browser.
  static Uri web(String address) => Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'destination': address.trim(),
      });

  static Uri app(MapsApp app, String address) {
    final a = address.trim();
    return switch (app) {
      MapsApp.apple => Uri.https('maps.apple.com', '/', {'daddr': a}),
      MapsApp.google => Uri(
          scheme: 'comgooglemaps',
          host: '',
          queryParameters: {'daddr': a, 'directionsmode': 'driving'},
        ),
      MapsApp.waze => Uri.https('waze.com', '/ul', {'q': a, 'navigate': 'yes'}),
    };
  }

  /// Checked with canLaunchUrl (iOS: LSApplicationQueriesSchemes).
  static Uri probe(MapsApp app) => switch (app) {
        MapsApp.apple => Uri.parse('maps://'),
        MapsApp.google => Uri.parse('comgooglemaps://'),
        MapsApp.waze => Uri.parse('waze://'),
      };
}

/// The seam for tests (url_launcher's platform calls).
@visibleForTesting
class MapsLauncher {
  const MapsLauncher();
  Future<bool> canOpen(Uri uri) => canLaunchUrl(uri);
  Future<bool> open(Uri uri) =>
      launchUrl(uri, mode: LaunchMode.externalApplication);
}

@visibleForTesting
MapsLauncher mapsLauncher = const MapsLauncher();

/// Owner 2026-10-28: a tapped address (case, chat place, task) opens in a
/// maps app with the address filled in for directions.
///
/// - Android: the system chooser of the installed maps apps (`geo:`).
/// - iPhone (iOS has no system chooser): a sheet with the maps apps that
///   are installed (Apple Maps always; Google Maps, Waze when present) and
///   «Copy the address».
/// - Web / nothing installed: Google Maps directions in the browser.
///
/// False = nothing could be opened (a snack bar says so).
Future<bool> openAddressInMaps(
  BuildContext context,
  Translator t,
  String address, {
  @visibleForTesting TargetPlatform? platform,
  @visibleForTesting bool? web,
}) async {
  final a = address.trim();
  if (a.isEmpty) return false;
  final os = platform ?? defaultTargetPlatform;
  final isWeb = web ?? kIsWeb;
  bool ok;
  if (!isWeb && os == TargetPlatform.iOS) {
    final apps = <MapsApp>[MapsApp.apple];
    for (final app in [MapsApp.google, MapsApp.waze]) {
      if (await _safe(() => mapsLauncher.canOpen(MapsLinks.probe(app)))) {
        apps.add(app);
      }
    }
    if (!context.mounted) return false;
    final choice = await _chooseApp(context, t, a, apps);
    if (choice == null || !context.mounted) return false;
    if (choice == _copy) {
      await Clipboard.setData(ClipboardData(text: a));
      if (context.mounted) showAppSnackBar(context, t.t('tasks.place.copied'));
      return true;
    }
    if (choice is! MapsApp) return false;
    ok = await _safe(() => mapsLauncher.open(MapsLinks.app(choice, a)));
  } else if (!isWeb && os == TargetPlatform.android) {
    ok = await _safe(() => mapsLauncher.open(MapsLinks.geo(a))) ||
        await _safe(() => mapsLauncher.open(MapsLinks.web(a)));
  } else {
    ok = await _safe(() => mapsLauncher.open(MapsLinks.web(a)));
  }
  if (!ok && context.mounted) showAppSnackBar(context, t.t('card.map.failed'));
  return ok;
}

const Object _copy = 'copy';

Future<bool> _safe(Future<bool> Function() call) async {
  try {
    return await call();
  } on Object {
    return false;
  }
}

Future<Object?> _chooseApp(
  BuildContext context,
  Translator t,
  String address,
  List<MapsApp> apps,
) =>
    showAppBottomSheet<Object>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          key: const ValueKey('maps-chooser'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                0,
                AppSpacing.screenSide,
                AppSpacing.sm,
              ),
              child: Text(
                address,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            for (final app in apps)
              AppListRow(
                key: ValueKey('maps-${app.name}'),
                icon: app == MapsApp.waze
                    ? AppIcons.directionsCarOutlined
                    : AppIcons.mapOutlined,
                label: switch (app) {
                  MapsApp.apple => t.t('tasks.place.apple'),
                  MapsApp.google => t.t('tasks.place.google'),
                  // A brand name: the same in every language.
                  MapsApp.waze => 'Waze',
                },
                onTap: () => Navigator.of(ctx).pop(app),
              ),
            AppListRow(
              key: const ValueKey('maps-copy'),
              icon: AppIcons.copyOutlined,
              label: t.t('tasks.place.copy'),
              onTap: () => Navigator.of(ctx).pop(_copy),
            ),
          ],
        ),
      ),
    );
