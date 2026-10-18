import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:lawbid/features/support/domain/support_models.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Owner 2026-10-18 (OQ-055): what the app attaches to a new ticket so the
/// team can reproduce a problem — app version and build, platform, OS
/// version, phone model, app language, theme, time zone and the screen the
/// user came from. Every source is best-effort: one that fails is simply
/// left out, never an error for the user.
Future<SupportClientContext> collectSupportContext({
  required String? language,
  required String? theme,
  String? route,
}) async {
  String? version;
  String? build;
  try {
    final info = await PackageInfo.fromPlatform();
    version = info.version;
    build = info.buildNumber;
  } on Object {
    // Left out.
  }
  var platform = 'other';
  String? os;
  String? model;
  try {
    if (kIsWeb) {
      platform = 'web';
      final w = await DeviceInfoPlugin().webBrowserInfo;
      model = w.browserName.name;
      os = w.platform;
    } else if (Platform.isAndroid) {
      platform = 'android';
      final a = await DeviceInfoPlugin().androidInfo;
      model = '${a.manufacturer} ${a.model}';
      os = 'Android ${a.version.release} (SDK ${a.version.sdkInt})';
    } else if (Platform.isIOS) {
      platform = 'ios';
      final i = await DeviceInfoPlugin().iosInfo;
      model = i.utsname.machine;
      os = 'iOS ${i.systemVersion}';
    }
  } on Object {
    // Left out.
  }
  String? zone;
  try {
    zone = (await FlutterTimezone.getLocalTimezone()).identifier;
  } on Object {
    zone = DateTime.now().timeZoneName;
  }
  return SupportClientContext(
    appVersion: version,
    buildNumber: build,
    platform: platform,
    osVersion: os,
    deviceModel: model,
    language: language,
    theme: theme,
    timezone: zone,
    route: route,
  );
}

/// The location the user was on before the support screens: walks the
/// router's stack from the top and skips the support routes themselves.
/// Null when it cannot be read.
String? originRoute(List<String> stack, {required String supportPrefix}) {
  for (final loc in stack.reversed) {
    if (!loc.startsWith(supportPrefix)) return loc;
  }
  return null;
}
