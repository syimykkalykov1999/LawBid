import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart'
    show myPracticesProvider;
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show PickerField, stateName;
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_providers.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_form_screen.dart'
    show pickHotlineLanguages;
import 'package:lawbid/features/hotline/presentation/hotline_text.dart'
    show hotlineLanguages;
import 'package:lawbid/features/onboarding/domain/us_states.dart' show kRegions;
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart'
    show OptionPickerSheet, PickerOption;
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:material_ui/material_ui.dart';

/// What the attorney may put on his line (owner 18.11): the categories of
/// his profile's practices and the states of his VERIFIED licences — the
/// server checks the same (goOnline, recheckAccess). [languages] are his
/// profile's languages, only pre-selected for convenience: the line takes
/// any language of the full list, like the client (owner 25.11).
@immutable
class HotlineAllowed {
  const HotlineAllowed({
    required this.practices,
    required this.states,
    required this.languages,
  });

  final List<String> practices;
  final List<String> states;
  final List<String> languages;
}

final hotlineAllowedProvider =
    FutureProvider.autoDispose<HotlineAllowed>((ref) async {
  final profile = await ref.watch(ownAttorneyProfileProvider.future);
  final practices = await ref.watch(myPracticesProvider.future);
  final cats = <String>[];
  for (final p in practices) {
    final code = p.categoryCode.isNotEmpty
        ? p.categoryCode
        : practiceCategoryOf(practiceCodeOf(p.i18nKey));
    if (code.isNotEmpty && !cats.contains(code)) cats.add(code);
  }
  return HotlineAllowed(
    practices: cats,
    states: [
      for (final l in profile.licenses)
        if (l.status == LicenseState.verified) l.state.code,
    ],
    languages: [
      for (final l in profile.languages) l.trim().toLowerCase(),
    ],
  );
});

/// The language's own name (the same 85-language catalogue as the profile).
String hotlineLanguageLabel(String code) =>
    kLanguageCatalog
        .where((l) => l.code == code)
        .map((l) => l.nativeName)
        .firstOrNull ??
    code;

/// A banded counter in words: «0» → «нет», «1» → «есть», «10+» as is.
String hotlineBand(Translator t, String raw) => switch (raw) {
      '' || '0' => t.t('hotline.band.none'),
      '1' => t.t('hotline.band.some'),
      _ => raw,
    };

/// «Моё → Вопросы → Горячая линия» (mockup a2 settings, a3 on the line).
/// The attorney is on the line only while this screen is open: leaving it,
/// putting the app away (the web tab hidden) or «Выключить линию» takes him
/// off; the server also drops a line whose heartbeat stops (cron sweep).
class HotlineLineScreen extends ConsumerStatefulWidget {
  const HotlineLineScreen({super.key});

  @override
  ConsumerState<HotlineLineScreen> createState() => _HotlineLineScreenState();
}

class _HotlineLineScreenState extends ConsumerState<HotlineLineScreen>
    with WidgetsBindingObserver {
  HotlineChoice? _choice;
  Timer? _clock;
  late final HotlineAttorneyController _line;

  @override
  void initState() {
    super.initState();
    _line = ref.read(hotlineAttorneyControllerProvider.notifier);
    WidgetsBinding.instance.addObserver(this);
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && ref.read(hotlineAttorneyControllerProvider).online) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _clock?.cancel();
    // Left the screen: off the line (a call already taken goes on).
    // (after this frame: no provider change while the tree is torn down)
    final line = _line;
    unawaited(Future<void>.microtask(line.goOffline));
    super.dispose();
  }

  bool get _inCall => ref.read(callControllerProvider).busy;

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    // Put away (or the web tab hidden): off the line — but never in the
    // middle of a call; that waits for the call's end (see build).
    if ((s == AppLifecycleState.paused || s == AppLifecycleState.hidden) &&
        !_inCall) {
      unawaited(_line.goOffline(away: true));
    }
  }

  HotlineChoice _initial(HotlineAllowed a) {
    final known = {for (final l in hotlineLanguages(ref)) l.code};
    final saved = _line.savedChoice().within(
          practices: a.practices.toSet(),
          states: a.states.toSet(),
          languages: known,
        );
    // Pre-selected: his profile's languages, else the app language.
    final ui = ref.read(languageControllerProvider).value?.code ?? 'en';
    final fromProfile = [
      for (final l in a.languages)
        if (known.contains(l)) l,
    ];
    return HotlineChoice(
      practiceAreas:
          saved.practiceAreas.isEmpty ? a.practices : saved.practiceAreas,
      states: saved.states.isEmpty ? a.states : saved.states,
      languages: saved.languages.isNotEmpty
          ? saved.languages
          : fromProfile.isNotEmpty
              ? fromProfile
              : [ui],
    );
  }

  /// The same sheet as the feed's «Выберите темы» / «Выберите штат» (owner
  /// 26.11): search, the state's code on the right, «Готово · N» — listing
  /// only what the line may take ([all]: his categories, his verified
  /// states; the others are not shown).
  Future<List<String>?> _pick({
    required String title,
    required List<String> all,
    required List<String> current,
    required List<PickerOption> options,
    String? searchHint,
    Future<Map<String, String?>> Function(String query)? remoteSearch,
  }) async {
    final picked = await OptionPickerSheet.show(
      context,
      title: title,
      options: options,
      initial: current.toSet(),
      multi: true,
      searchHint: searchHint,
      remoteSearch: remoteSearch,
    );
    if (picked == null) return null;
    return [
      for (final v in all)
        if (picked.contains(v)) v,
    ];
  }

  String _clockText(DateTime? since) {
    if (since == null) return '0:00';
    final d = DateTime.now().difference(since);
    final m = d.inMinutes;
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return m >= 60
        ? '${m ~/ 60}:${(m % 60).toString().padLeft(2, '0')}:$s'
        : '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final st = ref.watch(hotlineAttorneyControllerProvider);
    final cfg = ref.watch(hotlineAttorneyConfigProvider).value;
    final allowed = ref.watch(hotlineAllowedProvider);
    // A call taken while the app was put away: off the line once it ends.
    ref.listen<bool>(callControllerProvider.select((s) => s.busy), (was, now) {
      final away = WidgetsBinding.instance.lifecycleState;
      if ((was ?? false) &&
          !now &&
          (away == AppLifecycleState.paused ||
              away == AppLifecycleState.hidden)) {
        unawaited(_line.goOffline(away: true));
      }
    });
    final a = allowed.value;
    if (a != null) _choice ??= _initial(a);
    final choice = _choice ?? const HotlineChoice();

    Widget body;
    if (a == null) {
      body = allowed.hasError
          ? AppErrorState(
              message: t.t('hotline.att.err.other'),
              onRetry: () => ref.invalidate(hotlineAllowedProvider),
            )
          : const Center(child: CircularProgressIndicator.adaptive());
    } else if (st.online) {
      body = _OnLine(
        state: st,
        clock: _clockText(st.onlineSince),
        summary: [
          choice.practiceAreas.map((p) => practiceLabel(ref, p)).join(', '),
          choice.states.join(', '),
          choice.languages.map((l) => l.toUpperCase()).join(', '),
        ].join(' · '),
      );
    } else {
      body = _Settings(
        allowed: a,
        choice: choice,
        state: st,
        config: cfg,
        onPractices: () async {
          // Calls are matched by category (the client picks one), so the
          // line lists his categories; a subtopic or a word in any
          // language found by the search picks its category, like the
          // client's form.
          final search = practiceRemoteSearch(ref);
          final v = await _pick(
            title: t.t('hotline.att.practices'),
            all: a.practices,
            current: choice.practiceAreas,
            options: [
              for (final c in a.practices)
                PickerOption(value: c, label: practiceLabel(ref, c)),
            ],
            searchHint: t.t('practice.search.hint'),
            remoteSearch: (q) async => {
              for (final e in (await search(q)).entries)
                practiceCategoryOf(e.key): e.value,
            },
          );
          if (v != null && mounted) {
            setState(() => _choice = choice.copyWith(practiceAreas: v));
          }
        },
        onStates: () async {
          final v = await _pick(
            title: t.t('hotline.att.states'),
            all: a.states,
            current: choice.states,
            // as «Выберите штат»: the name, its code on the right, found
            // by the Russian name too
            options: [
              for (final c in a.states)
                if (kRegions.where((r) => r.code == c).firstOrNull
                    case final s?)
                  PickerOption(
                    value: s.code,
                    label: s.name,
                    sublabel: s.code,
                    keywords: s.aliases,
                  )
                else
                  PickerOption(value: c, label: stateName(c), sublabel: c),
            ],
          );
          if (v != null && mounted) {
            setState(() => _choice = choice.copyWith(states: v));
          }
        },
        onLanguages: () async {
          // the client's own languages sheet (owner 25.11): the full list
          final v = await pickHotlineLanguages(
            context,
            ref,
            initial: choice.languages,
            max: cfg?.attorneyMaxLanguages ?? 50,
            title: t.t('hotline.att.languages'),
          );
          if (v != null && v.isNotEmpty && mounted) {
            setState(() => _choice = choice.copyWith(languages: v));
          }
        },
      );
    }

    final access = cfg?.access;
    final mayWait = a != null &&
        choice.complete &&
        (access == null || access.allowed) &&
        (cfg?.enabled ?? true);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
        title: Text(t.t('hotline.att.title')),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(child: body),
            DecoratedBox(
              decoration: BoxDecoration(
                color: colors.bg,
                border: Border(top: BorderSide(color: colors.border)),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.md,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: st.online
                      ? AppButton(
                          key: const ValueKey('hotline-line-off'),
                          label: t.t('hotline.att.off'),
                          variant: AppButtonVariant.secondary,
                          height: 40,
                          onPressed: () => unawaited(_line.goOffline()),
                        )
                      : AppButton(
                          key: const ValueKey('hotline-line-on'),
                          label: t.t('hotline.att.wait'),
                          icon: AppIcons.callRounded,
                          height: 40,
                          isLoading: st.starting,
                          isEnabled: mayWait,
                          disabledHint: t.t('form.disabled.required'),
                          onPressed: () => unawaited(_line.goOnline(choice)),
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Settings extends ConsumerWidget {
  const _Settings({
    required this.allowed,
    required this.choice,
    required this.state,
    required this.config,
    required this.onPractices,
    required this.onStates,
    required this.onLanguages,
  });

  final HotlineAllowed allowed;
  final HotlineChoice choice;
  final HotlineLineState state;
  final HotlineAttorneyConfig? config;
  final VoidCallback onPractices;
  final VoidCallback onStates;
  final VoidCallback onLanguages;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final access = config?.access;
    final error = state.errorCode;
    final off = state.offReason;
    String pickedOr(
      List<String> v,
      String Function(String) label,
      String none,
    ) =>
        v.isEmpty ? none : v.map(label).join(', ');
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.xs,
        AppSpacing.screenSide,
        AppSpacing.screenSide,
      ),
      children: [
        if (off != null && off.isNotEmpty) ...[
          _Notice(text: hotlineOffReasonText(t, off), danger: true),
          const SizedBox(height: AppSpacing.md),
        ],
        if (access != null) ...[
          _AccessRow(access: access),
          const SizedBox(height: AppSpacing.md),
        ],
        PickerField(
          key: const ValueKey('hotline-line-practices'),
          label: t.t('hotline.att.practices'),
          value: allowed.practices.isEmpty
              ? t.t('hotline.att.noPractices')
              : pickedOr(
                  choice.practiceAreas,
                  (c) => practiceLabel(ref, c),
                  t.t('hotline.att.select'),
                ),
          enabled: allowed.practices.isNotEmpty,
          onTap: onPractices,
        ),
        const SizedBox(height: AppSpacing.md),
        PickerField(
          key: const ValueKey('hotline-line-states'),
          label: t.t('hotline.att.states'),
          value: allowed.states.isEmpty
              ? t.t('hotline.att.noStates')
              : pickedOr(choice.states, stateName, t.t('hotline.att.select')),
          enabled: allowed.states.isNotEmpty,
          onTap: onStates,
        ),
        const SizedBox(height: AppSpacing.md),
        PickerField(
          key: const ValueKey('hotline-line-languages'),
          label: t.t('hotline.att.languages'),
          value: pickedOr(
            choice.languages,
            hotlineLanguageLabel,
            t.t('hotline.att.select'),
          ),
          onTap: onLanguages,
        ),
        if (error != null) ...[
          const SizedBox(height: AppSpacing.md),
          _Notice(text: hotlineErrorText(t, error), danger: true),
        ],
        const SizedBox(height: AppSpacing.lg),
        _Counters(languages: choice.languages),
        if (config?.disclosure?.key != null) ...[
          const SizedBox(height: AppSpacing.lg),
          _Disclosure(disclosure: config!.disclosure!),
        ],
        const SizedBox(height: AppSpacing.md),
        Text(
          t.t('hotline.att.leaveNote'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

/// «На линии · 0:10», «Ждём звонок», what he waits for, the counters
/// (mockup a3).
class _OnLine extends ConsumerWidget {
  const _OnLine({
    required this.state,
    required this.clock,
    required this.summary,
  });

  final HotlineLineState state;
  final String clock;
  final String summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final line = state.line;
    final status = !state.accepting
        ? t.t('hotline.att.notAccepting')
        : line?.state == 'paused'
            ? t.t('hotline.att.paused')
            : t.t('hotline.att.waitingCall');
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.screenSide,
      ),
      children: [
        Center(
          child: Container(
            key: const ValueKey('hotline-online-status'),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: colors.success.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: colors.success,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  t.t('hotline.att.online', {'time': clock}),
                  style: type.caption.copyWith(
                    color: colors.success,
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        Center(
          child: AppIcon(AppIcons.callRounded, size: 44, color: colors.accent),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          status,
          textAlign: TextAlign.center,
          style: type.titleMedium.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          summary,
          textAlign: TextAlign.center,
          style: type.body.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.lg),
        _Counters(languages: line?.languages ?? const []),
        const SizedBox(height: AppSpacing.md),
        Text(
          t.t('hotline.att.leaveNote'),
          textAlign: TextAlign.center,
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

/// «Сейчас по вашим темам: язык · клиентов · адвокатов» (banded numbers).
class _Counters extends ConsumerWidget {
  const _Counters({required this.languages});

  final List<String> languages;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (languages.isEmpty) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final counters =
        ref.watch(hotlineAttorneyControllerProvider.select((s) => s.counters));
    final head = type.caption.copyWith(color: colors.textSecondary);
    final cell = type.body.copyWith(color: colors.text);
    Widget row(List<String> cells, TextStyle style) => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            children: [
              Expanded(flex: 2, child: Text(cells[0], style: style)),
              Expanded(child: Text(cells[1], style: style)),
              Expanded(child: Text(cells[2], style: style)),
            ],
          ),
        );
    return AppCard(
      key: const ValueKey('hotline-counters'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t.t('hotline.att.now'), style: head),
          const SizedBox(height: AppSpacing.xs),
          row(
            [
              t.t('hotline.att.col.language'),
              t.t('hotline.att.col.clients'),
              t.t('hotline.att.col.lawyers'),
            ],
            head,
          ),
          for (final l in languages)
            row(
              [
                hotlineLanguageLabel(l),
                hotlineBand(t, counters['l:$l']?.clients ?? ''),
                hotlineBand(t, counters['l:$l']?.lawyers ?? ''),
              ],
              cell,
            ),
        ],
      ),
    );
  }
}

/// «Горячая линия — в вашей подписке» / «нет в вашем тарифе · Подключить».
class _AccessRow extends ConsumerWidget {
  const _AccessRow({required this.access});

  final HotlineAccess access;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final text = access.allowed
        ? t.t('hotline.att.access.${access.via ?? 'free'}')
        : t.t('hotline.att.access.needed');
    return AppCard(
      key: const ValueKey('hotline-access'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          AppIcon(
            access.allowed
                ? AppIcons.verifiedRounded
                : AppIcons.lockOutlineRounded,
            size: 20,
            color: access.allowed ? colors.success : colors.textSecondary,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(text, style: type.body.copyWith(color: colors.text)),
          ),
          if (!access.allowed)
            TextButton(
              key: const ValueKey('hotline-access-connect'),
              onPressed: () => unawaited(
                context.push<void>(
                  AppRoutes.subscriptionRequiredFor('hotline'),
                ),
              ),
              child: Text(t.t('hotline.att.access.connect')),
            ),
        ],
      ),
    );
  }
}

/// The one-time text (ABA 7.2/7.3) with «Понятно».
class _Disclosure extends ConsumerWidget {
  const _Disclosure({required this.disclosure});

  final HotlineAttorneyDisclosure disclosure;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ui = ref.watch(languageControllerProvider).value?.code ?? 'en';
    final text = (ui == 'ru' ? disclosure.ru : disclosure.en) ??
        disclosure.en ??
        disclosure.ru ??
        '';
    if (text.isEmpty) return const SizedBox.shrink();
    return AppCard(
      key: const ValueKey('hotline-disclosure'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(text, style: type.caption.copyWith(color: colors.textSecondary)),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(
              onPressed: () => unawaited(
                ref
                    .read(hotlineAttorneyControllerProvider.notifier)
                    .ackDisclosure(disclosure.version),
              ),
              child: Text(t.t('hotline.disclosure.ok')),
            ),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, this.danger = false});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(
      text,
      key: const ValueKey('hotline-line-notice'),
      style: type.body.copyWith(
        color: danger ? colors.danger : colors.textSecondary,
      ),
    );
  }
}

/// Why the line went off by itself (server `hotline:line` detail).
String hotlineOffReasonText(Translator t, String reason) => switch (reason) {
      'missed' ||
      'licence' ||
      'access' ||
      'switched_off' =>
        t.t('hotline.att.offReason.$reason'),
      'not_in_plan' ||
      'addon_required' ||
      'off_for_all' =>
        t.t('hotline.att.offReason.access'),
      _ => t.t('hotline.att.offReason.other'),
    };

/// Why «Ожидать звонки» was refused (`details.reason` or the code).
String hotlineErrorText(Translator t, String code) => switch (code) {
      'too_many_combinations' => t.t('hotline.att.err.too_many_combinations'),
      'ATTORNEY_NOT_VERIFIED' || 'licence' => t.t('hotline.att.err.states'),
      'FEATURE_DISABLED' => t.t('hotline.att.offReason.switched_off'),
      'ENTITLEMENT_REQUIRED' ||
      'SUBSCRIPTION_REQUIRED' ||
      'not_in_plan' ||
      'addon_required' =>
        t.t('hotline.att.offReason.access'),
      _ => t.t('hotline.att.err.other'),
    };
