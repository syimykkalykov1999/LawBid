import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/data/consultations_repository.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/features/consultations/presentation/booking_sheet.dart';
import 'package:lawbid/features/consultations/presentation/consultation_detail_screen.dart';
import 'package:lawbid/features/consultations/presentation/consultation_settings_screen.dart';
import 'package:lawbid/features/consultations/presentation/consultations_screen.dart';
import 'package:lawbid/features/deadlines/application/deadlines_providers.dart';
import 'package:lawbid/features/deadlines/data/deadlines_repository.dart';
import 'package:lawbid/features/deadlines/domain/deadline_models.dart';
import 'package:lawbid/features/deadlines/presentation/deadline_calculator_screen.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/ask_question_screen.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart';
import 'package:lawbid/features/legal_qa/presentation/question_detail_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/long_locale.dart';
import '../helpers/referral_overrides.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-20: every new screen of the consultations / «Ask a lawyer» /
/// deadline-calculator PR fits a 360 dp phone at text x1.0 and x1.1 (the
/// largest the app allows), left-to-right and right-to-left. Locales: the
/// longest translation of every key across all languages the test fonts can
/// draw (that already covers the long German, Finnish, Hungarian… strings),
/// plus the real text of ne, ar, mr and de (other scripts draw as wide
/// boxes — stricter, never looser). The four themes run with the longest
/// locale; the single-language runs use one light theme.
void main() {
  setUpAll(initializeDateFormatting);

  final now = DateTime.now();
  final soon = now.add(const Duration(days: 2, hours: 3));
  const longName = 'Maximilian Konstantinopolitanski-Wojciechowicz';
  const longTitle =
      'Can my landlord legally keep the whole security deposit after I moved '
      'out and left the apartment clean, with photographs of every room?';
  const longBody =
      'I gave written notice two months ahead, returned every key on the '
      'last day and took photographs of every room. Three weeks later the '
      'landlord sent a list of deductions that I never agreed to, '
      'Donaudampfschifffahrtsgesellschaftskapitän-Straße 12, 10115 Berlin.';

  Consultation consultation({
    required ConsultationStatus status,
    required bool viewerIsAttorney,
    bool canCall = false,
  }) =>
      Consultation(
        id: 'c-${status.name}-$viewerIsAttorney',
        status: status,
        startsAt: soon,
        endsAt: soon.add(const Duration(minutes: 30)),
        viewerIsAttorney: viewerIsAttorney,
        counterpart: const ConsultationPerson(
          id: 'p1',
          displayName: longName,
          username: 'maximilian.konstantinopolitanski',
        ),
        attorneyTimezone: 'America/Argentina/ComodRivadavia',
        canCall: canCall,
        note: longBody,
        cancelReason: status == ConsultationStatus.cancelled ? longBody : null,
        cancelledBy: status == ConsultationStatus.cancelled ? 'client' : null,
      );

  final consultations = [
    consultation(status: ConsultationStatus.pending, viewerIsAttorney: true),
    consultation(status: ConsultationStatus.confirmed, viewerIsAttorney: false),
    consultation(
      status: ConsultationStatus.confirmed,
      viewerIsAttorney: true,
      canCall: true,
    ),
  ];

  final settings = ConsultationSettings(
    enabled: true,
    slotMinutes: 30,
    bufferMinutes: 10,
    minNoticeHours: 24,
    horizonDays: 30,
    autoConfirm: false,
    timezone: 'America/New_York',
    windows: [
      for (final d in [1, 2, 3, 4, 5])
        ConsultationWindow(weekday: d, startMinute: 540, endMinute: 1020),
      const ConsultationWindow(weekday: 1, startMinute: 1080, endMinute: 1200),
    ],
    timeOff: const [
      ConsultationTimeOff(
        startsOn: '2026-12-24',
        endsOn: '2026-12-31',
        note: 'Winter holidays and the annual bar association conference',
      ),
    ],
    bookable: true,
  );

  final slotDays = [
    for (var i = 1; i <= 5; i++) isoDay(now.add(Duration(days: i))),
  ];
  final slots = ConsultationSlots(
    timezone: 'America/New_York',
    slotMinutes: 30,
    autoConfirm: false,
    from: slotDays.first,
    lastDate: slotDays.last,
    slots: [
      for (final d in slotDays)
        for (var h = 9; h < 17; h++)
          ConsultationSlot(
            startsAt:
                DateTime.parse('${d}T${h.toString().padLeft(2, '0')}:00:00Z'),
            local: '${d}T${h.toString().padLeft(2, '0')}:00',
          ),
    ],
  );

  QaAnswer answer({bool best = false, bool mine = false}) => QaAnswer(
        id: best ? 'a-best' : 'a-${mine ? 'mine' : 'other'}',
        questionId: 'q1',
        attorney: const QaPerson(
          id: 'l1',
          displayName: longName,
          username: 'maximilian.konstantinopolitanski',
        ),
        body: longBody,
        likeCount: 128,
        likedByMe: true,
        isBest: best,
        isMine: mine,
        createdAt: now,
      );

  Question question({
    String id = 'q1',
    bool mine = false,
    bool canAnswer = false,
    List<QaAnswer> answers = const [],
  }) =>
      Question(
        id: id,
        title: longTitle,
        body: longBody,
        isAnonymous: false,
        isMine: mine,
        answerCount: answers.length,
        canAnswer: canAnswer,
        createdAt: now,
        practiceArea: const QaPracticeArea(
          id: 'pa1',
          i18nKey: 'practice.real_estate',
          nameEn: 'Landlord and tenant disputes',
        ),
        stateCode: 'NY',
        stateName: 'New York',
        author: const QaPerson(id: 'u1', displayName: longName),
        bestAnswerId: answers.where((a) => a.isBest).firstOrNull?.id,
        answers: answers,
      );

  final answers = [answer(best: true), answer(mine: true), answer()];
  final questions = [
    question(answers: answers),
    question(id: 'q2'),
    question(id: 'q3', mine: true),
  ];

  const rule = DeadlineRule(
    code: 'frcp_12a_answer',
    jurisdiction: 'US',
    kind: DeadlineKind.court,
    labels: {
      'en': 'Answer to a complaint after service of the summons and complaint',
    },
    amount: 21,
    unit: 'day',
    dayType: 'calendar',
    direction: 'after',
    verified: false,
    citation: 'FRCP 12(a)(1)(A)(i)',
    notes: {
      'en': 'Counted from the day after service. If service was waived the '
          'time is 60 days; for the United States it is 60 days.',
    },
  );
  final result = DeadlineResult(
    rule: rule,
    eventDate: DateTime(2026, 10, 5),
    dueDate: DateTime(2026, 10, 26),
    rawDate: DateTime(2026, 10, 25),
    rolled: true,
    holidays: [
      DeadlineHoliday(
        date: DateTime(2026, 10, 12),
        names: const {'en': "Columbus Day / Indigenous Peoples' Day"},
      ),
    ],
    warnings: const {'holidays_missing'},
  );

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
      consultationsRepositoryProvider.overrideWithValue(
        _ConsultationsRepo(consultations, settings, slots),
      ),
      legalQaRepositoryProvider.overrideWithValue(
        _QaRepo(questions, {for (final q in questions) q.id: q}),
      ),
      deadlinesRepositoryProvider
          .overrideWithValue(_DeadlinesRepo(rule, result)),
    ];
  });

  final screens = <String, Widget Function()>{
    'consultations list': () => const ConsultationsScreen(),
    'consultation detail (attorney, request)': () =>
        ConsultationDetailScreen(id: consultations[0].id),
    'consultation detail (client, confirmed)': () =>
        ConsultationDetailScreen(id: consultations[1].id),
    'consultation detail (attorney, call)': () =>
        ConsultationDetailScreen(id: consultations[2].id),
    'consultation settings': () => const ConsultationSettingsScreen(),
    'questions feed': () => const QaFeedScreen(),
    'ask a question': () => const AskQuestionScreen(),
    'question detail with answers': () => const QuestionDetailScreen(id: 'q1'),
    'question detail, attorney may answer': () =>
        const QuestionDetailScreen(id: 'q2'),
    'deadline calculator with a result': () => const DeadlineCalculatorScreen(
          state: 'NY',
          caseId: 'case-1',
        ),
    'deadline calculator, statute of limitations': () =>
        const DeadlineCalculatorScreen(kind: 'statute_of_limitations'),
    'questions filter sheet': () => const QaFeedScreen(),
    'booking sheet': () => Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () => showConsultationBooking(
                context,
                attorneyId: 'att-1',
                attorneyName: longName,
              ),
              child: const Text('open'),
            ),
          ),
        ),
  };

  final locales = <String, (Translator Function(), TextDirection)>{
    'longest': (LongestTranslator.new, TextDirection.ltr),
    'longest rtl': (LongestTranslator.new, TextDirection.rtl),
    'ne': (() => ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (() => ShippedTranslator('ar'), TextDirection.rtl),
    'mr': (() => ShippedTranslator('mr'), TextDirection.ltr),
    'de': (() => ShippedTranslator('de'), TextDirection.ltr),
  };

  for (final MapEntry(key: name, value: (translator, dir)) in locales.entries) {
    // All four themes only with the longest text; one theme otherwise.
    final themes = name.startsWith('longest')
        ? AppThemeId.values
        : [AppThemeId.values.first];
    for (final theme in themes) {
      for (final scale in [1.0, 1.1]) {
        for (final attorney in [false, true]) {
          group(
              '$name / ${theme.name} / x$scale / '
              '${attorney ? 'attorney' : 'client'}', () {
            for (final MapEntry(key: screen, value: build) in screens.entries) {
              // The attorney's own settings and the answer box need the
              // attorney role; the rest is checked in both profiles.
              if (screen == 'consultation settings' && !attorney) continue;
              if (screen == 'question detail, attorney may answer' &&
                  !attorney) {
                continue;
              }
              testWidgets(screen, (tester) async {
                useNarrowPhone(tester);
                await tester.pumpWidget(
                  uxApp(
                    Directionality(textDirection: dir, child: build()),
                    theme: AppTheme.of(theme),
                    size: narrowPhone,
                    textScale: scale,
                    disableAnimations: true,
                    overrides: uxOverrides(
                      translator: translator(),
                      extra: [
                        ...base,
                        actsAsAttorneyProvider.overrideWithValue(attorney),
                      ],
                    ),
                  ),
                );
                await tester.pump();
                await tester.pump(const Duration(milliseconds: 400));
                if (screen == 'questions filter sheet') {
                  await tester
                      .tap(find.byKey(const ValueKey('qa-filter-button')));
                  await tester.pump();
                  await tester.pump(const Duration(milliseconds: 600));
                  expect(find.byType(AppButton), findsWidgets);
                }
                if (screen == 'booking sheet') {
                  await tester.tap(find.byType(ElevatedButton));
                  await tester.pump();
                  await tester.pump(const Duration(milliseconds: 600));
                }
                expect(tester.takeException(), isNull);
                // Real content is on screen (not an empty or errored one).
                final probe = _probes[screen];
                if (probe != null) {
                  expect(find.textContaining(probe), findsWidgets);
                }
              });
            }
          });
        }
      }
    }
  }
}

const _probes = <String, String>{
  'consultations list': 'Maximilian',
  'consultation detail (attorney, request)': 'Maximilian',
  'consultation detail (client, confirmed)': 'Maximilian',
  'consultation detail (attorney, call)': 'Maximilian',
  'questions feed': 'Can my landlord',
  'question detail with answers': 'Can my landlord',
  'question detail, attorney may answer': 'Can my landlord',
  'deadline calculator with a result': 'FRCP 12',
};

class _ConsultationsRepo extends ConsultationsRepository {
  _ConsultationsRepo(this.items, this._settings, this._slots) : super(Dio());

  final List<Consultation> items;
  final ConsultationSettings _settings;
  final ConsultationSlots _slots;

  @override
  Future<ConsultationSettings> settings() async => _settings;

  @override
  Future<ConsultationSlots> slots(
    String attorneyId, {
    String? from,
    int days = 14,
  }) async =>
      _slots;

  @override
  Future<CursorPage<Consultation>> list(
    ConsultationView view, {
    String? cursor,
  }) async =>
      CursorPage(items: items);

  @override
  Future<Consultation> get(String id) async =>
      items.firstWhere((c) => c.id == id);
}

class _QaRepo extends LegalQaRepository {
  _QaRepo(this.items, this.byId) : super(Dio());

  final List<Question> items;
  final Map<String, Question> byId;

  @override
  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async =>
      CursorPage(items: items);

  @override
  Future<Question> detail(String id) async => byId[id]!;
}

class _DeadlinesRepo extends DeadlinesRepository {
  _DeadlinesRepo(this.rule, this.result) : super(Dio());

  final DeadlineRule rule;
  final DeadlineResult result;

  @override
  Future<List<DeadlineRule>> rules({String? jurisdiction}) async => [rule];

  @override
  Future<DeadlineResult> calculate(String ruleCode, String eventDate) async =>
      result;
}
