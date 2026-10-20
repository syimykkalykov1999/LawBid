import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/ux_harness.dart';
import 'stories_fakes.dart';

/// Overrides every story test shares: English strings, the fake repository,
/// the signed-in user "me", the `stories` flag on.
Future<List<Override>> storyOverrides({
  FakeStoriesRepository? repo,
  FakeReplyChat? chat,
  bool enabled = true,
  Translator translator = const StaticTranslatorEn(),
  List<Override> extra = const [],
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return [
    ...uxOverrides(translator: translator),
    sharedPreferencesProvider.overrideWithValue(prefs),
    storiesRepositoryProvider
        .overrideWithValue(repo ?? FakeStoriesRepository()),
    storiesEnabledProvider.overrideWithValue(enabled),
    currentUserIdProvider.overrideWithValue('me'),
    if (chat != null) chatRepositoryProvider.overrideWithValue(chat),
    ...extra,
  ];
}

Widget storyApp(
  Widget home, {
  required List<Override> overrides,
  ThemeData? theme,
  TextDirection direction = TextDirection.ltr,
  double textScale = 1,
}) =>
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: theme ?? AppTheme.light(),
        builder: (context, child) => Directionality(
          textDirection: direction,
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(textScale),
              disableAnimations: true,
            ),
            child: child!,
          ),
        ),
        home: home,
      ),
    );

void useSmallPhone(WidgetTester tester) {
  tester.view
    ..devicePixelRatio = 3
    ..physicalSize = const Size(360, 780) * 3;
  addTearDown(tester.view.reset);
}
