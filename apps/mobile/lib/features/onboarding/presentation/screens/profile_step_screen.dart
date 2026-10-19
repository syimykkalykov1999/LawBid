import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/limits/text_limits.dart';
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
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_edit_screen.dart'
    show UsernameStatus, usernamePattern;
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart';
import 'package:lawbid/features/profile/presentation/widgets/username_suggestions.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Server limit for first/last name (apps/api UpdateProfileDto @Length(1, 80)).
// docs/03 §4.1 limits (server enforces the same).
const kNameMaxLength = 50;

/// Max attorney bio length (docs/01_FOUNDATION_AUTH.md §11 Шаг 3B).
int get kBioMaxLength => TextLimits.of(TextLimit.bio);

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
  final _email = TextEditingController();
  final _bio = TextEditingController();
  final _firm = TextEditingController();
  final _contactTime = TextEditingController();

  /// Owner 2026-10-18 («как в инсте»): the @username, offered from the
  /// name until the person types their own; free handles as chips.
  final _username = TextEditingController();
  bool _usernameTouched = false;
  UsernameStatus _usernameStatus = UsernameStatus.unchanged;
  List<String> _suggestions = const [];
  Timer? _usernameDebounce;
  int _usernameSeq = 0;
  Set<String> _states = {};
  Set<String> _languages = {};
  String? _contactMethod;
  bool _attempted = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _usernameDebounce?.cancel();
    for (final c in [
      _first,
      _last,
      _email,
      _bio,
      _firm,
      _contactTime,
      _username,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _prefill(CurrentUser user) {
    if (_prefilled) return;
    _prefilled = true;
    _first.text = user.firstName ?? '';
    _last.text = user.lastName ?? '';
    _email.text = user.email ?? '';
    final client = user.clientProfile;
    final attorney = user.attorneyProfile;
    final handle = client?.username ?? attorney?.username;
    if (handle != null && handle.isNotEmpty) {
      _username.text = handle;
      _usernameTouched = true;
    } else {
      // Ideas from the name already on the account (or none yet).
      WidgetsBinding.instance.addPostFrameCallback((_) => _onNameChanged());
    }
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

  /// The name changed: until the person types a @username, offer the
  /// first free one from the name and the rest as chips.
  void _onNameChanged() {
    if (_usernameTouched || !mounted) return;
    _usernameDebounce?.cancel();
    final seq = ++_usernameSeq;
    _usernameDebounce = Timer(const Duration(milliseconds: 600), () async {
      final first = _first.text.trim();
      final last = _last.text.trim();
      if (first.isEmpty && last.isEmpty) return;
      try {
        final list = await ref
            .read(attorneyProfileRepositoryProvider)
            .suggestUsernames(firstName: first, lastName: last);
        if (!mounted || seq != _usernameSeq || _usernameTouched) return;
        if (list.isEmpty) return;
        setState(() {
          _username.text = list.first;
          _usernameStatus = UsernameStatus.available;
          _suggestions = list.skip(1).toList();
        });
      } catch (_) {
        // No ideas: the server derives a handle from the name on save.
      }
    });
  }

  void _onUsernameChanged(String value) {
    _usernameTouched = true;
    _usernameDebounce?.cancel();
    final u = value.trim();
    if (u.isEmpty) {
      setState(() {
        _usernameStatus = UsernameStatus.unchanged;
        _suggestions = const [];
      });
      return;
    }
    if (!usernamePattern.hasMatch(u)) {
      setState(() => _usernameStatus = UsernameStatus.invalid);
      return;
    }
    setState(() => _usernameStatus = UsernameStatus.checking);
    final seq = ++_usernameSeq;
    _usernameDebounce = Timer(const Duration(milliseconds: 450), () async {
      try {
        final r =
            await ref.read(attorneyProfileRepositoryProvider).checkUsername(
                  u,
                  firstName: _first.text,
                  lastName: _last.text,
                );
        if (!mounted || seq != _usernameSeq) return;
        setState(() {
          _suggestions = r.suggestions;
          _usernameStatus = r.available
              ? UsernameStatus.available
              : switch (r.issue) {
                  UsernameIssue.reserved => UsernameStatus.reserved,
                  UsernameIssue.taken => UsernameStatus.taken,
                  _ => UsernameStatus.invalid,
                };
        });
      } catch (_) {
        if (mounted && seq == _usernameSeq) {
          setState(() => _usernameStatus = UsernameStatus.error);
        }
      }
    });
  }

  bool get _usernameBlocked => const {
        UsernameStatus.invalid,
        UsernameStatus.taken,
        UsernameStatus.reserved,
        UsernameStatus.checking,
      }.contains(_usernameStatus);

  /// The handle to send: what is on the form unless it is empty or was
  /// never checked (the server keeps / derives one then).
  String get _usernameToSend =>
      _usernameStatus == UsernameStatus.available ? _username.text.trim() : '';

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

  /// Owner 2026-10-11: Continue is grey until the required data is in.
  bool _ready(CurrentUser user) {
    if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) return false;
    if (user.role == UserRole.assistant) return true;
    if (!_emailOk || _usernameBlocked) return false;
    return (user.isAttorney || _states.isNotEmpty) && !_photoMissing(user);
  }

  /// Owner 2026-10-13: format check only — no code is sent.
  bool get _emailOk =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(_email.text.trim());

  String? _emailError(Translator t) {
    if (_email.text.trim().isEmpty) return _required(_email, t);
    if (!_emailOk) return t.t('onboarding.profile.error.email');
    return null;
  }

  Future<void> _submit(CurrentUser user) async {
    setState(() => _attempted = true);
    // OQ-048: an assistant needs only a name (no states, no profile).
    if (user.role == UserRole.assistant) {
      if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) return;
      await ref
          .read(onboardingActionsProvider.notifier)
          .saveAssistantName(_first.text, _last.text);
      return;
    }
    final statesOk = user.isAttorney || _states.isNotEmpty;
    if (_first.text.trim().isEmpty ||
        _last.text.trim().isEmpty ||
        !statesOk ||
        !_emailOk ||
        _usernameBlocked ||
        _photoMissing(user)) {
      return;
    }
    final profile = user.isAttorney
        ? AttorneyProfileInput(
            firstName: _first.text,
            lastName: _last.text,
            email: _email.text,
            username: _usernameToSend,
            bio: _bio.text,
            firmName: _firm.text,
            languages: _languages.toList(),
            licensedStates: _states.toList(),
          )
        : ClientProfileInput(
            firstName: _first.text,
            lastName: _last.text,
            email: _email.text,
            username: _usernameToSend,
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
    // The photo upload finishing re-evaluates the Continue button.
    ref.watch(avatarUploadControllerProvider);
    final attorney = user.isAttorney;
    final assistant = user.role == UserRole.assistant;

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
      for (final s in kRegions)
        PickerOption(
          value: s.code,
          label: s.name,
          sublabel: s.code,
          keywords: s.aliases,
        ),
    ];

    Future<void> pickStates() async {
      final result = await OptionPickerSheet.show(
        context,
        title: t.t(
          attorney
              ? 'onboarding.profile.licensedStates'
              : 'onboarding.profile.state',
        ),
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
      title: t.t(
        attorney
            ? 'onboarding.profile.title.attorney'
            : assistant
                ? 'onboarding.role.assistant.title'
                : 'onboarding.profile.title.client',
      ),
      // Owner 2026-10-13: no «license details come with verification»
      // line for attorneys.
      subtitle: attorney
          ? null
          : t.t(
              assistant
                  ? 'onboarding.role.assistant.body'
                  : 'onboarding.profile.subtitle.client',
            ),
      // Owner 2026-10-04: an assistant has no contacts step (code sign-in)
      // and their role is fixed — back is the consents. Owner 2026-10-15:
      // everyone else goes back to the role, to choose again.
      onBack: () => context.go(
        OnboardingRoutes.forStep(
          assistant ? OnboardingStepId.consents : OnboardingStepId.role,
        ),
      ),
      error: action.error,
      primaryLabel: t.t('onboarding.continue'),
      primaryLoading: action.busy,
      primaryEnabled: _ready(user),
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
          inputFormatters: [
            LengthLimitingTextInputFormatter(TextLimits.of(TextLimit.name)),
          ],
          onChanged: (_) {
            setState(() {});
            _onNameChanged();
          },
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _last,
          label: t.t('onboarding.profile.lastName'),
          errorText: _required(_last, t),
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.familyName],
          inputFormatters: [
            LengthLimitingTextInputFormatter(TextLimits.of(TextLimit.name)),
          ],
          onChanged: (_) {
            setState(() {});
            _onNameChanged();
          },
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t(
            attorney
                ? 'onboarding.profile.realNameHint.attorney'
                : 'onboarding.profile.realNameHint',
          ),
          style: Theme.of(context)
              .extension<AppTypographyTokens>()!
              .caption
              .copyWith(
                color: Theme.of(context)
                    .extension<AppColorTokens>()!
                    .textSecondary,
              ),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (!assistant) ...[
          AppTextField(
            key: const ValueKey('onboarding-username'),
            controller: _username,
            label: t.t('profile.username.label'),
            leading: Text(
              '@',
              style: Theme.of(context)
                  .extension<AppTypographyTokens>()!
                  .body
                  .copyWith(
                    color: Theme.of(context)
                        .extension<AppColorTokens>()!
                        .textSecondary,
                  ),
            ),
            helperText: switch (_usernameStatus) {
              UsernameStatus.checking => t.t('profile.username.checking'),
              UsernameStatus.available => t.t('profile.username.available'),
              UsernameStatus.error => t.t('profile.username.checkFailed'),
              _ => null,
            },
            errorText: switch (_usernameStatus) {
              UsernameStatus.taken => t.t('error.api.USERNAME_TAKEN'),
              UsernameStatus.reserved => t.t('error.api.USERNAME_RESERVED'),
              UsernameStatus.invalid => t.t('profile.username.invalid'),
              _ => null,
            },
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9._]')),
              LengthLimitingTextInputFormatter(30),
            ],
            onChanged: _onUsernameChanged,
          ),
          UsernameSuggestions(
            suggestions: _suggestions,
            onPick: (v) {
              _username.text = v;
              _onUsernameChanged(v);
            },
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            controller: _email,
            label: t.t('onboarding.profile.email'),
            errorText: _flagRequired ? _emailError(t) : null,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('onboarding.profile.emailHint'),
            style: Theme.of(context)
                .extension<AppTypographyTokens>()!
                .caption
                .copyWith(
                  color: Theme.of(context)
                      .extension<AppColorTokens>()!
                      .textSecondary,
                ),
          ),
        ],
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
        if (!assistant) ...[
          // An attorney's states are entered only on the License step.
          if (!attorney) ...[
            PickerField(
              label: t.t('onboarding.profile.state'),
              placeholder: t.t('onboarding.profile.select'),
              value: statesValue,
              errorText: statesError,
              onTap: pickStates,
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          PickerField(
            label: t.t('onboarding.profile.languages'),
            placeholder: t.t('onboarding.profile.select'),
            value: _languages.isEmpty
                ? null
                : _languages.map(languageLabel).join(', '),
            onTap: pickLanguages,
          ),
        ],
        if (!attorney && !assistant) ...[
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
                      () => _contactMethod = _contactMethod == m ? null : m,
                    ),
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
