import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show PickerField, pickState, stateName;
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/hotline/hotline_routes.dart';
import 'package:lawbid/features/hotline/presentation/hotline_text.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:material_ui/material_ui.dart';

/// «Позвонить адвокату» — ONE page (owner 18.11, mockup v4 c2): «О чём
/// звонок» (≤ `hotline.topic_max_chars`), the qualification, the state
/// (from the profile) and up to 3 languages (the app language picked;
/// the field ▾ opens all 85 with a search, c2L). The same fields, pickers
/// and buttons as the case form.
class HotlineFormScreen extends ConsumerStatefulWidget {
  const HotlineFormScreen({super.key});

  @override
  ConsumerState<HotlineFormScreen> createState() => _HotlineFormScreenState();
}

class _HotlineFormScreenState extends ConsumerState<HotlineFormScreen> {
  final _topic = TextEditingController();
  String? _practice;
  String? _state;
  List<String> _languages = const [];

  @override
  void initState() {
    super.initState();
    final c = ref.read(hotlineControllerProvider.notifier);
    unawaited(c.loadConfig());
    final last = ref.read(hotlineControllerProvider).draft;
    final profile = ref.read(currentUserControllerProvider).user?.clientProfile;
    _state = last?.state ?? profile?.stateCode;
    final ui = ref.read(languageControllerProvider).value?.code ?? 'en';
    _languages = last?.languages ?? [ui];
    _practice = last?.practice;
    if (last != null) _topic.text = last.topic;
  }

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  int get _max =>
      ref.read(hotlineControllerProvider).config?.maxLanguages ?? 3;

  HotlineDraft get _draft => HotlineDraft(
        topic: _topic.text,
        practice: _practice ?? '',
        state: _state ?? '',
        languages: _languages,
      );

  Future<void> _pickPractice() async {
    final t = ref.read(translatorProvider);
    // The qualification is a category: attorneys wait on categories, a
    // subtopic found by the search picks its category.
    final options = [
      for (final o in practiceOptions(ref))
        if (!o.nested) o,
    ];
    final search = practiceRemoteSearch(ref);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('hotline.c.form.practice'),
      searchHint: t.t('practice.search.hint'),
      options: options,
      initial: {if (_practice != null) _practice!},
      remoteSearch: (q) async => {
        for (final e in (await search(q)).entries)
          practiceCategoryOf(e.key): e.value,
      },
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    setState(() => _practice = practiceCategoryOf(picked.first));
  }

  Future<void> _pickState() async {
    final s = await pickState(context, ref.read(translatorProvider));
    if (s != null && mounted) setState(() => _state = s);
  }

  Future<void> _pickLanguages() async {
    final picked = await pickHotlineLanguages(
      context,
      ref,
      initial: _languages,
      max: _max,
    );
    if (picked != null && picked.isNotEmpty && mounted) {
      setState(() => _languages = picked);
    }
  }

  Future<void> _submit() async {
    final c = ref.read(hotlineControllerProvider.notifier);
    final ok = await c.start(_draft);
    if (!mounted) return;
    if (ok) {
      context.pushReplacement(HotlineRoutes.status);
      return;
    }
    final text = hotlineErrorText(
      ref.read(translatorProvider),
      ref.read(hotlineControllerProvider).errorCode,
    );
    if (text != null) showAppSnackBar(context, text);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final flow = ref.watch(hotlineControllerProvider);
    final langs = hotlineLanguages(ref);
    final maxChars = flow.config?.topicMaxChars ?? 80;
    final draft = _draft;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('hotline.c.form.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.xs,
                  AppSpacing.screenSide,
                  AppSpacing.screenSide,
                ),
                children: [
                  AppTextField(
                    key: const ValueKey('hotline-topic'),
                    controller: _topic,
                    label: t.t('hotline.c.form.topic'),
                    hintText: t.t('hotline.c.form.topicHint'),
                    semanticLabel: t.t('hotline.c.form.topic'),
                    maxLength: maxChars,
                    maxLines: 2,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  PickerField(
                    key: const ValueKey('hotline-practice'),
                    label: t.t('hotline.c.form.practice'),
                    value: _practice == null
                        ? t.t('hotline.c.form.select')
                        : practiceLabel(ref, _practice!),
                    onTap: () => unawaited(_pickPractice()),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  PickerField(
                    key: const ValueKey('hotline-state'),
                    label: t.t('hotline.c.form.state'),
                    value: _state == null
                        ? t.t('hotline.c.form.select')
                        : stateName(_state!),
                    helper: t.t('hotline.c.form.stateNote'),
                    onTap: () => unawaited(_pickState()),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  PickerField(
                    key: const ValueKey('hotline-languages'),
                    label: t.t('hotline.c.form.languages', {'max': '$_max'}),
                    value: _languages
                        .map((c) => hotlineLanguageName(langs, c))
                        .join(', '),
                    helper: t.t('hotline.c.form.languagesNote'),
                    onTap: () => unawaited(_pickLanguages()),
                  ),
                ],
              ),
            ),
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
                  child: AppButton(
                    key: const ValueKey('hotline-call'),
                    label: t.t('hotline.c.form.call'),
                    icon: AppIcons.callRounded,
                    height: 40,
                    isLoading: flow.busy,
                    isEnabled: draft.valid,
                    disabledHint: t.t('form.disabled.required'),
                    onPressed: () => unawaited(_submit()),
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

/// The languages sheet (owner 18.11, mockup c2L): all 85 app languages with
/// a search, up to [max], the picked ones as removable chips on top and
/// «Готово». The same list the attorney's line uses.
Future<List<String>?> pickHotlineLanguages(
  BuildContext context,
  WidgetRef ref, {
  required List<String> initial,
  required int max,
}) async {
  final t = ref.read(translatorProvider);
  final ui = ref.read(languageControllerProvider).value?.code ?? 'en';
  final langs = hotlineLanguages(ref);
  final picked = await OptionPickerSheet.show(
    context,
    title: t.t('hotline.c.form.languages', {'max': '$max'}),
    options: [
      for (final LanguageCatalogEntry l in langs)
        PickerOption(
          value: l.code,
          label: l.nativeName,
          sublabel: languageSublabel(ui, l.code, l.nativeName),
          keywords: [l.englishName, l.code],
        ),
    ],
    initial: initial.toSet(),
    multi: true,
    maxSelected: max,
    limitMessage: t.t('hotline.c.form.langLimit', {'max': '$max'}),
    chipsOnTop: true,
  );
  if (picked == null) return null;
  // Keeps the order the person had, new ones after.
  return [
    for (final c in initial)
      if (picked.contains(c)) c,
    for (final c in picked)
      if (!initial.contains(c)) c,
  ];
}
