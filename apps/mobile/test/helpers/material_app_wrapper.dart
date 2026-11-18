// golden_toolkit 0.15.0 `materialAppWrapper` (lib/src/testing_tools.dart),
// copied as is: Copyright 2019-2020 eBay Inc., BSD-3-Clause (full text in
// apps/mobile/THIRD_PARTY_NOTICES.md). Only the import changed: Flutter 3.50
// deprecated package:flutter/material.dart, the app's ThemeData now comes
// from package:material_ui, and golden_toolkit (discontinued, last release
// 0.15.0) still types its wrapper with the SDK's ThemeData.
import 'package:golden_toolkit/golden_toolkit.dart' show WidgetWrapper;
import 'package:material_ui/material_ui.dart';

/// golden_toolkit's `materialAppWrapper` on material_ui's [MaterialApp].
WidgetWrapper materialAppWrapper({
  TargetPlatform platform = TargetPlatform.android,
  Iterable<LocalizationsDelegate<dynamic>>? localizations,
  NavigatorObserver? navigatorObserver,
  Iterable<Locale>? localeOverrides,
  ThemeData? theme,
}) {
  return (child) => MaterialApp(
        localizationsDelegates: localizations,
        supportedLocales: localeOverrides ?? const [Locale('en')],
        theme: theme?.copyWith(platform: platform),
        debugShowCheckedModeBanner: false,
        home: Material(child: child),
        navigatorObservers: [
          if (navigatorObserver != null) navigatorObserver,
        ],
      );
}
