import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart';

/// `/profile/edit` — the role decides which editor opens.
class ProfileEditScreen extends ConsumerWidget {
  const ProfileEditScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAttorney = ref.watch(currentUserControllerProvider
        .select((s) => s.user?.isAttorney ?? false));
    return isAttorney
        ? const AttorneyProfileEditScreen()
        : const ClientProfileEditScreen();
  }
}

/// Client profile editor (docs/03 §5): name, photo, state, preferred
/// languages, preferred contact method + time note (file 01 step 3A).
class ClientProfileEditScreen extends ConsumerWidget {
  const ClientProfileEditScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final profile = ref.watch(clientProfileProvider);
    void retry() => ref.invalidate(clientProfileProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('profile.edit.title')),
        leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: profile.when(
        loading: () => const ProfileEditSkeleton(),
        error: (error, _) => isOfflineError(error)
            ? AppOfflineState(
                title: t.t('offline.title'),
                message: t.t('offline.message'),
                action: AppButton(
                  label: t.t('error.retry'),
                  icon: Icons.refresh_rounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: retry,
                ),
              )
            : AppErrorState(
                message: t.t('profile.error'),
                retryLabel: t.t('error.retry'),
                onRetry: retry),
        data: (p) => _ClientEditForm(profile: p),
      ),
    );
  }
}

class _ClientEditForm extends ConsumerStatefulWidget {
  const _ClientEditForm({required this.profile});

  final ClientProfileDetails profile;

  @override
  ConsumerState<_ClientEditForm> createState() => _ClientEditFormState();
}

class _ClientEditFormState extends ConsumerState<_ClientEditForm> {
  late final _first =
      TextEditingController(text: widget.profile.firstName ?? '');
  late final _last = TextEditingController(text: widget.profile.lastName ?? '');
  late final _note =
      TextEditingController(text: widget.profile.contactNote ?? '');
  late final _username = TextEditingController(text: widget.profile.username);
  UsernameStatus _usernameStatus = UsernameStatus.unchanged;
  Timer? _debounce;
  int _checkSeq = 0;
  late String _state = widget.profile.state.code;
  late Set<String> _languages = widget.profile.languages.toSet();
  late ContactPreference? _method = widget.profile.contactMethod;
  bool _saving = false;
  bool _attempted = false;

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_first, _last, _note, _username]) {
      c.dispose();
    }
    super.dispose();
  }

  /// OQ-026: same rules and the same availability check as an attorney's
  /// @username (one namespace for both roles).
  void _onUsernameChanged(String value) {
    _debounce?.cancel();
    final u = value.trim();
    if (u.toLowerCase() == widget.profile.username.toLowerCase()) {
      setState(() => _usernameStatus = UsernameStatus.unchanged);
      return;
    }
    if (!usernamePattern.hasMatch(u)) {
      setState(() => _usernameStatus = UsernameStatus.invalid);
      return;
    }
    setState(() => _usernameStatus = UsernameStatus.checking);
    final seq = ++_checkSeq;
    _debounce = Timer(const Duration(milliseconds: 450), () async {
      try {
        final r =
            await ref.read(attorneyProfileRepositoryProvider).checkUsername(u);
        if (!mounted || seq != _checkSeq) return;
        setState(() {
          _usernameStatus = r.available
              ? UsernameStatus.available
              : switch (r.issue) {
                  UsernameIssue.reserved => UsernameStatus.reserved,
                  UsernameIssue.taken => UsernameStatus.taken,
                  _ => UsernameStatus.invalid,
                };
        });
      } catch (_) {
        if (mounted && seq == _checkSeq) {
          setState(() => _usernameStatus = UsernameStatus.error);
        }
      }
    });
  }

  Future<void> _save(Translator t) async {
    setState(() => _attempted = true);
    if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) return;
    if (const {
      UsernameStatus.invalid,
      UsernameStatus.taken,
      UsernameStatus.reserved
    }.contains(_usernameStatus)) {
      return;
    }
    setState(() => _saving = true);
    try {
      final repo = ref.read(clientProfileRepositoryProvider);
      await repo.update(
        ClientProfilePatch(
          firstName: _first.text,
          lastName: _last.text,
          username: _usernameStatus == UsernameStatus.unchanged
              ? null
              : _username.text.trim(),
          stateCode: _state,
          languages: _languages.toList(),
          contactNote: _note.text,
        ),
      );
      // The method goes through contact-preferences so "none" can clear it.
      await repo.updateContactPreferences(method: _method, note: _note.text);
      if (!mounted) return;
      ref.invalidate(clientProfileProvider);
      await ref.read(currentUserControllerProvider.notifier).load();
      if (!mounted) return;
      showAppSnackBar(context, t.t('profile.edit.saved'));
      Navigator.of(context).maybePop();
    } catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    String? required(TextEditingController c) =>
        _attempted && c.text.trim().isEmpty
            ? t.t('onboarding.profile.error.required')
            : null;
    String languageLabel(String code) =>
        kLanguageCatalog
            .where((l) => l.code == code)
            .map((l) => l.nativeName)
            .firstOrNull ??
        code;

    final (String? usernameHelper, String? usernameError) =
        switch (_usernameStatus) {
      UsernameStatus.unchanged => (null, null),
      UsernameStatus.checking => (t.t('profile.username.checking'), null),
      UsernameStatus.available => (t.t('profile.username.available'), null),
      UsernameStatus.taken => (null, t.t('error.api.USERNAME_TAKEN')),
      UsernameStatus.reserved => (null, t.t('error.api.USERNAME_RESERVED')),
      UsernameStatus.invalid => (null, t.t('profile.username.invalid')),
      UsernameStatus.error => (t.t('profile.username.checkFailed'), null),
    };
    final nextChange = widget.profile.usernameNextChangeAt;

    final fields = <Widget>[
      AppCard(
        child: AvatarPickerField(
            initials:
                initialsOf(widget.profile.firstName, widget.profile.lastName)),
      ),
      AppTextField(
        controller: _username,
        label: t.t('profile.username.label'),
        enabled: nextChange == null || !nextChange.isAfter(DateTime.now()),
        leading: Text('@',
            style: Theme.of(context)
                .extension<AppTypographyTokens>()!
                .body
                .copyWith(
                    color: Theme.of(context)
                        .extension<AppColorTokens>()!
                        .textSecondary)),
        helperText: usernameHelper,
        errorText: usernameError,
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9._]')),
          LengthLimitingTextInputFormatter(30),
        ],
        onChanged: _onUsernameChanged,
      ),
      AppTextField(
        controller: _first,
        label: t.t('onboarding.profile.firstName'),
        errorText: required(_first),
        textCapitalization: TextCapitalization.words,
        inputFormatters: [LengthLimitingTextInputFormatter(kAttorneyNameMax)],
        onChanged: (_) => setState(() {}),
      ),
      AppTextField(
        controller: _last,
        label: t.t('onboarding.profile.lastName'),
        errorText: required(_last),
        textCapitalization: TextCapitalization.words,
        inputFormatters: [LengthLimitingTextInputFormatter(kAttorneyNameMax)],
        onChanged: (_) => setState(() {}),
      ),
      PickerField(
        label: t.t('onboarding.profile.state'),
        placeholder: t.t('onboarding.profile.select'),
        value: usStateByCode(_state)?.name,
        onTap: () async {
          final result = await OptionPickerSheet.show(
            context,
            title: t.t('onboarding.profile.state'),
            options: [
              for (final s in kUsStates)
                PickerOption(value: s.code, label: s.name, sublabel: s.code)
            ],
            initial: {_state},
          );
          if (result != null && result.isNotEmpty)
            setState(() => _state = result.first);
        },
      ),
      PickerField(
        label: t.t('onboarding.profile.languages'),
        placeholder: t.t('onboarding.profile.select'),
        value: _languages.isEmpty
            ? null
            : _languages.map(languageLabel).join(', '),
        onTap: () async {
          final result = await OptionPickerSheet.show(
            context,
            title: t.t('onboarding.profile.languages'),
            options: [
              for (final l in kLanguageCatalog)
                PickerOption(
                    value: l.code,
                    label: l.nativeName,
                    sublabel:
                        l.englishName == l.nativeName ? null : l.englishName),
            ],
            initial: _languages,
            multi: true,
          );
          if (result != null) setState(() => _languages = result);
        },
      ),
      ContactPreferenceChips(
        value: _method,
        onChanged: (m) => setState(() => _method = m),
      ),
      AppTextField(
        controller: _note,
        label: t.t('onboarding.profile.contactTime'),
        hintText: t.t('onboarding.profile.contactTimeHint'),
        helperText: t.t('onboarding.profile.contactHint'),
        maxLength: 80,
      ),
    ];

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
            children: [
              for (var i = 0; i < fields.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.lg),
                AppEntrance(index: i, child: fields[i]),
              ],
            ],
          ),
        ),
        ProfileSaveBar(
            label: t.t('profile.edit.save'),
            loading: _saving,
            onPressed: () => _save(t)),
      ],
    );
  }
}

/// Preferred contact method chips (docs/01 §11 3A); tap again to clear.
class ContactPreferenceChips extends ConsumerWidget {
  const ContactPreferenceChips(
      {required this.value, required this.onChanged, super.key});

  final ContactPreference? value;
  final ValueChanged<ContactPreference?> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.t('onboarding.profile.contactMethod'),
          style: typography.bodySmall
              .copyWith(color: colors.text, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final m in ContactPreference.values)
              Semantics(
                selected: value == m,
                inMutuallyExclusiveGroup: true,
                child: AppChip(
                  label: t.t('onboarding.profile.contactMethod.${m.name}'),
                  selected: value == m,
                  height: AppSizes.touchTarget,
                  onTap: () => onChanged(value == m ? null : m),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
