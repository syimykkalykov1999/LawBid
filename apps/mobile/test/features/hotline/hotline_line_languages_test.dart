import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_providers.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_line_screen.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 25.11: the attorney picks the languages of his line like the
/// client — the client's own sheet, the full language list, his profile's
/// languages pre-selected, the admin cap `hotline.attorney_max_languages`.

class _Idle extends CallController {
  @override
  CallSession build() => const CallSession();
}

class _Line extends HotlineAttorneyController {
  HotlineChoice? started;

  @override
  HotlineLineState build() => const HotlineLineState();

  @override
  HotlineChoice savedChoice() => const HotlineChoice();

  @override
  Future<void> goOnline(HotlineChoice choice) async => started = choice;

  @override
  Future<void> goOffline({bool away = false}) async {}
}

const _cfg = HotlineAttorneyConfig(
  enabled: true,
  mode: HotlineLineMode.onForAll,
  heartbeatSec: 25,
  offerTimeoutSec: 10,
  countersIntervalSec: 5,
  attorneyMaxLanguages: 2,
);

Future<_Line> _pump(WidgetTester tester) async {
  useNarrowPhone(tester);
  final line = _Line();
  await tester.pumpWidget(
    uxApp(
      const HotlineLineScreen(),
      theme: AppTheme.light(),
      size: narrowPhone,
      overrides: [
        translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        callControllerProvider.overrideWith(_Idle.new),
        hotlineAttorneyControllerProvider.overrideWith(() => line),
        hotlineAttorneyConfigProvider.overrideWith((ref) async => _cfg),
        practiceTreeProvider.overrideWith((ref) async => const []),
        hotlineAllowedProvider.overrideWith(
          (ref) async => const HotlineAllowed(
            practices: ['family'],
            states: ['CA'],
            // his profile speaks Russian only
            languages: ['ru'],
          ),
        ),
      ],
    ),
  );
  await tester.pumpAndSettle();
  return line;
}

void main() {
  testWidgets(
      'the attorney line: the client sheet with the full list, profile '
      'language pre-selected, a language outside the profile goes on the line',
      (tester) async {
    final line = await _pump(tester);
    final field = find.byKey(const ValueKey('hotline-line-languages'));
    expect(field, findsOneWidget);
    expect(
      find.descendant(of: field, matching: find.text('Русский')),
      findsOneWidget,
    );

    await tester.tap(field);
    await tester.pumpAndSettle();
    final sheet = find.byType(OptionPickerSheet);
    expect(sheet, findsOneWidget);
    final picker = tester.widget<OptionPickerSheet>(sheet);
    // the same sheet as the client: every language of the catalogue, chips
    // on top, the admin cap
    final codes = {for (final o in picker.options) o.value};
    expect(codes, containsAll(<String>['ru', 'en', 'de', 'es']));
    // the client's list (the compiled-in catalogue until the server list loads)
    expect(codes, {for (final l in kLanguageCatalog) l.code});
    expect(picker.chipsOnTop, isTrue);
    expect(picker.maxSelected, 2);
    expect(picker.initial, {'ru'});

    // pick German (not in his profile) and close with «Готово»
    await tester.enterText(
      find.descendant(of: sheet, matching: find.byType(TextField)).first,
      'German',
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find
          .ancestor(of: find.text('Deutsch'), matching: find.byType(AppListRow))
          .first,
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: sheet, matching: find.byType(AppButton)).last,
    );
    await tester.pumpAndSettle();
    expect(find.byType(OptionPickerSheet), findsNothing);
    expect(
      find.descendant(of: field, matching: find.textContaining('Deutsch')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey('hotline-line-on')));
    await tester.pump();
    expect(line.started?.languages, ['ru', 'de']);
  });

  testWidgets(
      'qualifications and states open the feed pickers: only what the line '
      'may take, search, the state code on the right', (tester) async {
    await _pump(tester);

    await tester.tap(find.byKey(const ValueKey('hotline-line-states')));
    await tester.pumpAndSettle();
    var sheet = find.byType(OptionPickerSheet);
    var picker = tester.widget<OptionPickerSheet>(sheet);
    // only his verified states (no other state is listed)
    expect(picker.options.map((o) => o.value), ['CA']);
    expect(picker.options.single.label, 'California');
    expect(picker.options.single.sublabel, 'CA');
    expect(picker.options.single.keywords, contains('Калифорния'));
    expect(picker.multi, isTrue);
    expect(picker.initial, {'CA'});
    // found by the Russian name, like «Выберите штат»
    await tester.enterText(
      find.descendant(of: sheet, matching: find.byType(TextField)).first,
      'Калифорния',
    );
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: sheet, matching: find.text('California')),
      findsOneWidget,
    );
    await tester.tap(
      find.descendant(of: sheet, matching: find.byType(AppButton)).last,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('hotline-line-practices')));
    await tester.pumpAndSettle();
    sheet = find.byType(OptionPickerSheet);
    picker = tester.widget<OptionPickerSheet>(sheet);
    // only his categories, the practice search of «Выберите темы»
    expect(picker.options.map((o) => o.value), ['family']);
    expect(picker.searchHint, isNotNull);
    expect(picker.remoteSearch, isNotNull);
    expect(picker.multi, isTrue);
  });
}
