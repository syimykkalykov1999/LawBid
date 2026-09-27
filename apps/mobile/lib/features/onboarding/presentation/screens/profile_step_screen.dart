import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';

/// Server limit for first/last name (apps/api UpdateProfileDto @Length(1, 80)).
const kNameMaxLength = 80;

/// Max attorney bio length (docs/01_FOUNDATION_AUTH.md §11 Шаг 3B).
const kBioMaxLength = 300;

/// Preferred contact methods (§11 Шаг 3A "звонок / SMS / email / чат").
const kContactMethods = ['call', 'sms', 'email', 'chat'];

/// `/onboarding/profile`:
/// - client (§11 Шаг 3A): real first/last name, state of residence (50+DC),
///   preferred languages, optional preferred contact method + convenient
///   time;
/// - attorney (§11 Шаг 3B): first/last name, short bio (≤300), firm
///   (optional), languages, licensed states (multi-select).
///
/// Names go to `PATCH /users/me`; everything else is step data (`PATCH
/// /users/me/onboarding` `data.profile`) until the profile tables land in
/// file 03. Photo upload needs the S3 pipeline (file 03/06) — not in this
/// stage.
class ProfileStepScreen extends ConsumerStatefulWidget {
  const ProfileStepScreen({super.key});

  @override
  ConsumerState<ProfileStepScreen> createState() => _ProfileStepScreenState();
}

class _ProfileStepScreenState extends ConsumerState<ProfileStepScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _bio = TextEditingController();
  final _firm = TextEditingController();
  final _contactTime = TextEditingController();
  Set<String> _states = {};
  Set<String> _languages = {};
  String? _contactMethod;
  bool _attempted = false;
  bool _prefilled = false;

  @override
  void dispose() {
    for (final c in [_first, _last, _bio, _firm, _contactTime]) {
      c.dispose();
    }
    super.dispose();
  }

  void _prefill(CurrentUser user) {
    if (_prefilled) return;
    _prefilled = true;
    _first.text = user.firstName ?? '';
    _last.text = user.lastName ?? '';
    final saved = user.onboarding.data['profile'];
    if (saved is Map<String, dynamic>) {
      _bio.text = saved['bio'] as String? ?? '';
      _firm.text = saved['firm'] as String? ?? '';
      _contactTime.text = saved['contactTime'] as String? ?? '';
      _contactMethod = saved['contactMethod'] as String?;
      final state = saved['state'];
      if (state is String) _states = {state};
      final states = saved['licensedStates'];
      if (states is List) _states = states.whereType<String>().toSet();
      final langs = saved['languages'];
      if (langs is List) _languages = langs.whereType<String>().toSet();
    }
  }

  String? _required(TextEditingController c, Translator t) =>
      _attempted && c.text.trim().isEmpty
          ? t.t('onboarding.profile.error.required')
          : null;

  Future<void> _submit(CurrentUser user) async {
    setState(() => _attempted = true);
    final statesOk = _states.isNotEmpty;
    if (_first.text.trim().isEmpty || _last.text.trim().isEmpty || !statesOk)
      return;
    final data = user.isAttorney
        ? <String, dynamic>{
            'bio': _bio.text.trim(),
            'firm': _firm.text.trim(),
            'languages': _languages.toList()..sort(),
            'licensedStates': _states.toList()..sort(),
          }
        : <String, dynamic>{
            'state': _states.first,
            'languages': _languages.toList()..sort(),
            if (_contactMethod != null) 'contactMethod': _contactMethod,
            if (_contactTime.text.trim().isNotEmpty)
              'contactTime': _contactTime.text.trim(),
          };
    await ref.read(onboardingActionsProvider.notifier).saveProfile(
          firstName: _first.text,
          lastName: _last.text,
          data: data,
        );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final user = ref.watch(currentUserControllerProvider).user;
    final action = ref.watch(onboardingActionsProvider);
    if (user == null) return const SizedBox.shrink();
    _prefill(user);
    final attorney = user.isAttorney;

    final languageOptions = [
      for (final LanguageCatalogEntry l in kLanguageCatalog)
        PickerOption(
          value: l.code,
          label: l.nativeName,
          sublabel: l.englishName == l.nativeName ? null : l.englishName,
        ),
    ];
    String? languageLabel(String code) {
      for (final l in kLanguageCatalog) {
        if (l.code == code) return l.nativeName;
      }
      return code;
    }

    final stateOptions = [
      for (final s in kUsStates)
        PickerOption(value: s.code, label: s.name, sublabel: s.code),
    ];

    Future<void> pickStates() async {
      final result = await OptionPickerSheet.show(
        context,
        title: t.t(attorney
            ? 'onboarding.profile.licensedStates'
            : 'onboarding.profile.state'),
        options: stateOptions,
        initial: _states,
        multi: attorney,
      );
      if (result != null) setState(() => _states = result);
    }

    Future<void> pickLanguages() async {
      final result = await OptionPickerSheet.show(
        context,
        title: t.t('onboarding.profile.languages'),
        options: languageOptions,
        initial: _languages,
        multi: true,
      );
      if (result != null) setState(() => _languages = result);
    }

    final statesValue = _states.isEmpty
        ? null
        : attorney
            ? (_states.toList()..sort()).join(', ')
            : usStateByCode(_states.first)?.name;
    final statesError = _attempted && _states.isEmpty
        ? t.t('onboarding.profile.error.required')
        : null;

    return OnboardingScaffold(
      step: OnboardingStepId.profile,
      title: t.t(attorney
          ? 'onboarding.profile.title.attorney'
          : 'onboarding.profile.title.client'),
      subtitle: t.t(attorney
          ? 'onboarding.profile.subtitle.attorney'
          : 'onboarding.profile.subtitle.client'),
      onBack: () =>
          context.go(OnboardingRoutes.forStep(OnboardingStepId.contacts)),
      error: action.error,
      primaryLabel: t.t('onboarding.continue'),
      primaryLoading: action.busy,
      onPrimary: () => _submit(user),
      children: [
        AppTextField(
          controller: _first,
          label: t.t('onboarding.profile.firstName'),
          errorText: _required(_first, t),
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.givenName],
          inputFormatters: [LengthLimitingTextInputFormatter(kNameMaxLength)],
          onChanged: (_) => _attempted ? setState(() {}) : null,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _last,
          label: t.t('onboarding.profile.lastName'),
          errorText: _required(_last, t),
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.familyName],
          inputFormatters: [LengthLimitingTextInputFormatter(kNameMaxLength)],
          onChanged: (_) => _attempted ? setState(() {}) : null,
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t(attorney
              ? 'onboarding.profile.realNameHint.attorney'
              : 'onboarding.profile.realNameHint'),
          style: Theme.of(context)
              .extension<AppTypographyTokens>()!
              .caption
              .copyWith(
                  color: Theme.of(context)
                      .extension<AppColorTokens>()!
                      .textSecondary),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (attorney) ...[
          AppTextField(
            controller: _bio,
            label: t.t('onboarding.profile.bio'),
            hintText: t.t('onboarding.profile.bioHint'),
            maxLines: 4,
            maxLength: kBioMaxLength,
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            controller: _firm,
            label: t.t('onboarding.profile.firm'),
            helperText: t.t('common.optional'),
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.organizationName],
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        PickerField(
          label: t.t(attorney
              ? 'onboarding.profile.licensedStates'
              : 'onboarding.profile.state'),
          placeholder: t.t('onboarding.profile.select'),
          value: statesValue,
          errorText: statesError,
          onTap: pickStates,
        ),
        const SizedBox(height: AppSpacing.lg),
        PickerField(
          label: t.t('onboarding.profile.languages'),
          placeholder: t.t('onboarding.profile.select'),
          value: _languages.isEmpty
              ? null
              : _languages.map(languageLabel).join(', '),
          onTap: pickLanguages,
        ),
        if (!attorney) ...[
          const SizedBox(height: AppSpacing.xl),
          StepSectionLabel(t.t('onboarding.profile.contactMethod')),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final m in kContactMethods)
                Semantics(
                  selected: _contactMethod == m,
                  inMutuallyExclusiveGroup: true,
                  child: AppChip(
                    label: t.t('onboarding.profile.contactMethod.$m'),
                    selected: _contactMethod == m,
                    height: AppSizes.touchTarget,
                    onTap: () => setState(
                        () => _contactMethod = _contactMethod == m ? null : m),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            controller: _contactTime,
            label: t.t('onboarding.profile.contactTime'),
            hintText: t.t('onboarding.profile.contactTimeHint'),
            helperText: t.t('onboarding.profile.contactHint'),
            maxLength: 120,
          ),
        ],
      ],
    );
  }
}
