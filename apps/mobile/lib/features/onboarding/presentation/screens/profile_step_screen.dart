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
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart';

/// Server limit for first/last name (apps/api UpdateProfileDto @Length(1, 80)).
// docs/03 §4.1 limits (server enforces the same).
const kNameMaxLength = 50;

/// Max attorney bio length (docs/01_FOUNDATION_AUTH.md §11 Шаг 3B).
const kBioMaxLength = 300;

/// Preferred contact methods (§11 Шаг 3A "звонок / SMS / email / чат").
/// UI ids (translation keys `onboarding.profile.contactMethod.<id>`); the
/// server enum spells the chat option `in_app_chat`.
const kContactMethods = ['call', 'sms', 'email', 'chat'];

/// UI id → apps/api `ContactMethod` value.
String? contactMethodToWire(String? id) => id == 'chat' ? 'in_app_chat' : id;

/// apps/api `ContactMethod` value → UI id.
String? contactMethodFromWire(String? wire) =>
    wire == 'in_app_chat' ? 'chat' : wire;

/// `/onboarding/profile`:
/// - client (§11 Шаг 3A): real first/last name, state of residence (50+DC),
///   preferred languages, optional preferred contact method + convenient
///   time;
/// - attorney (§11 Шаг 3B): first/last name, short bio (≤300), firm
///   (optional), languages, licensed states (multi-select).
///
/// Everything (names included) goes as the structured `profile` of `PATCH
/// /users/me/onboarding` and lands in client_profiles / attorney_profiles
/// in one server transaction. Attorneys also add their business photo here
/// (docs/01 §11 3B, OQ-012; docs/03 stage 3.9): the one new field, a plain
/// form row in the step's existing style, uploaded via presign → storage
/// → confirm → `PATCH /users/me {avatarFileId}`.
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
    final client = user.clientProfile;
    final attorney = user.attorneyProfile;
    if (client != null) {
      _states = {client.stateCode};
      _languages = client.languages.toSet();
      _contactMethod = contactMethodFromWire(client.contactMethod);
      _contactTime.text = client.contactNote ?? '';
      return;
    }
    if (attorney != null) {
      _bio.text = attorney.bio ?? '';
      _firm.text = attorney.firmName ?? '';
      _languages = attorney.languages.toSet();
      _states = attorney.licensedStates.toSet();
      return;
    }
    // Fallback: the free-form step data an older build saved.
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

  /// Flag required fields after Continue, or when the server sent the
  /// user back here because something is missing (OnboardingBlocker).
  bool get _flagRequired =>
      _attempted ||
      ref.read(onboardingBlockerProvider)?.step == OnboardingStepId.profile;

  String? _required(TextEditingController c, Translator t) =>
      _flagRequired && c.text.trim().isEmpty
          ? t.t('onboarding.profile.error.required')
          : null;

  /// docs/03 §4.1 / OQ-012: an attorney cannot finish without a clean
  /// photo — the server reports it as `missing: photo` until the upload
  /// is confirmed and scanned.
  bool _photoMissing(CurrentUser user) =>
      user.isAttorney &&
      user.missing.contains(MissingRequirement.photo) &&
      ref.read(avatarUploadControllerProvider).stage != AvatarUploadStage.done;

  Future<void> _submit(CurrentUser user) async {
    setState(() => _attempted = true);
    final statesOk = _states.isNotEmpty;
    if (_first.text.trim().isEmpty ||
        _last.text.trim().isEmpty ||
        !statesOk ||
        _photoMissing(user)) {
      return;
    }
    final ProfileInput profile = user.isAttorney
        ? AttorneyProfileInput(
            firstName: _first.text,
            lastName: _last.text,
            bio: _bio.text,
            firmName: _firm.text,
            languages: _languages.toList(),
            licensedStates: _states.toList(),
          )
        : ClientProfileInput(
            firstName: _first.text,
            lastName: _last.text,
            stateCode: _states.first,
            languages: _languages.toList(),
            contactMethod: contactMethodToWire(_contactMethod),
            contactNote: _contactTime.text,
          );
    await ref.read(onboardingActionsProvider.notifier).saveProfile(profile);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final user = ref.watch(currentUserControllerProvider).user;
    final action = ref.watch(onboardingActionsProvider);
    ref.watch(onboardingBlockerProvider);
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
    final statesError = _flagRequired && _states.isEmpty
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
        if (attorney) ...[
          AvatarPickerField(
            initials: initialsOf(_first.text, _last.text),
            requiredError: _flagRequired && _photoMissing(user)
                ? t.t('onboarding.profile.error.photoRequired')
                : null,
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
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
            maxLength: 80,
          ),
        ],
      ],
    );
  }
}
