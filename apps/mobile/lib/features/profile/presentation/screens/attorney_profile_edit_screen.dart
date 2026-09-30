import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';

/// docs/03 §4.1 limits (the server enforces the same).
const kAttorneyNameMax = 50;
const kAttorneyBioMax = 300;
const kAttorneyFirmMax = 80;

/// OQ-030: firms per attorney profile.
const kAttorneyFirmsMax = 5;

/// docs/03 §4.1 @username: 3–30 latin letters, digits, `_` and `.`; not
/// starting/ending with `.`/`_`; no `..`. Reserved words and uniqueness are
/// the server's call (`GET /attorneys/username-available`).
final usernamePattern = RegExp(r'^(?![._])(?!.*\.\.)[A-Za-z0-9._]{3,30}(?<![._])$');

enum UsernameStatus { unchanged, checking, available, taken, reserved, invalid, error }

/// Edit own attorney profile (docs/03 §4.1): photo, first/last name, @username
/// (live availability + 30-day cooldown), bio ≤ 300, firm ≤ 80, languages;
/// links to practices; licenses shown read-only with their status.
class AttorneyProfileEditScreen extends ConsumerWidget {
  const AttorneyProfileEditScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final own = ref.watch(ownAttorneyProfileProvider);
    void retry() => ref.invalidate(ownAttorneyProfileProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('profile.edit.title')),
        leading: AppBackButton(semanticLabel: t.t('common.back'), onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: own.when(
        loading: () => const _EditSkeleton(),
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
            : AppErrorState(message: t.t('profile.error'), retryLabel: t.t('error.retry'), onRetry: retry),
        data: (p) => _AttorneyEditForm(profile: p),
      ),
    );
  }
}

class _AttorneyEditForm extends ConsumerStatefulWidget {
  const _AttorneyEditForm({required this.profile});

  final OwnAttorneyProfile profile;

  @override
  ConsumerState<_AttorneyEditForm> createState() => _AttorneyEditFormState();
}

class _AttorneyEditFormState extends ConsumerState<_AttorneyEditForm> {
  late final _first = TextEditingController(text: widget.profile.firstName ?? '');
  late final _last = TextEditingController(text: widget.profile.lastName ?? '');
  late final _username = TextEditingController(text: widget.profile.username);
  late final _bio = TextEditingController(text: widget.profile.bio ?? '');
  late final _firm = TextEditingController();
  late List<String> _firms = [
    ...(widget.profile.firms.isNotEmpty
        ? widget.profile.firms
        : [if ((widget.profile.firmName ?? '').trim().isNotEmpty) widget.profile.firmName!]),
  ];
  late Set<String> _languages = widget.profile.languages.toSet();
  UsernameStatus _usernameStatus = UsernameStatus.unchanged;
  Timer? _debounce;
  int _checkSeq = 0;
  bool _saving = false;
  bool _attempted = false;

  OwnAttorneyProfile get p => widget.profile;

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_first, _last, _username, _bio, _firm]) {
      c.dispose();
    }
    super.dispose();
  }

  void _onUsernameChanged(String value) {
    _debounce?.cancel();
    final u = value.trim();
    if (u.toLowerCase() == p.username.toLowerCase()) {
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
        final r = await ref.read(attorneyProfileRepositoryProvider).checkUsername(u);
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
        if (mounted && seq == _checkSeq) setState(() => _usernameStatus = UsernameStatus.error);
      }
    });
  }

  List<String> get _originalFirms => p.firms.isNotEmpty
      ? p.firms
      : [if ((p.firmName ?? '').trim().isNotEmpty) p.firmName!];

  bool get _firmsChanged =>
      _firms.length != _originalFirms.length ||
      !_firms.asMap().entries.every((e) => _originalFirms[e.key] == e.value);

  /// OQ-030: add the typed firm to the list (≤ 5, no duplicates).
  void _addFirm() {
    final v = _firm.text.trim();
    if (v.isEmpty || _firms.length >= kAttorneyFirmsMax) return;
    if (_firms.any((f) => f.toLowerCase() == v.toLowerCase())) return;
    setState(() {
      _firms = [..._firms, v];
      _firm.clear();
    });
  }

  String? _changed(TextEditingController c, String? original) {
    final v = c.text.trim();
    return v == (original ?? '').trim() ? null : v;
  }

  Future<void> _save(Translator t) async {
    setState(() => _attempted = true);
    if (_first.text.trim().isEmpty || _last.text.trim().isEmpty) return;
    if (const {UsernameStatus.checking, UsernameStatus.taken, UsernameStatus.reserved, UsernameStatus.invalid}
        .contains(_usernameStatus)) {
      return;
    }
    final languagesChanged =
        _languages.length != p.languages.length || !_languages.containsAll(p.languages);
    final patch = AttorneyProfilePatch(
      firstName: _changed(_first, p.firstName),
      lastName: _changed(_last, p.lastName),
      bio: _changed(_bio, p.bio),
      firms: _firmsChanged ? _firms : null,
      languages: languagesChanged ? _languages.toList() : null,
      username: _usernameStatus == UsernameStatus.unchanged ? null : _username.text.trim(),
    );
    if (patch.isEmpty) {
      Navigator.of(context).maybePop();
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(attorneyProfileRepositoryProvider).updateOwn(patch);
      if (!mounted) return;
      ref
        ..invalidate(ownAttorneyProfileProvider)
        ..invalidate(publicAttorneyProfileProvider(p.username));
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
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final now = ref.watch(clockProvider)();
    final usernameLocked = p.usernameLocked(now);
    final nameChangeNeedsRecheck = p.verification.isVerified;

    String? required(TextEditingController c) =>
        _attempted && c.text.trim().isEmpty ? t.t('onboarding.profile.error.required') : null;

    final (String? usernameHelper, String? usernameError) = switch (_usernameStatus) {
      UsernameStatus.unchanged => (
          usernameLocked
              ? t.t('profile.username.cooldown', {'date': formats.date(p.usernameNextChangeAt!)})
              : t.t('profile.username.hint'),
          null,
        ),
      UsernameStatus.checking => (t.t('profile.username.checking'), null),
      UsernameStatus.available => (t.t('profile.username.available'), null),
      UsernameStatus.taken => (null, t.t('error.api.USERNAME_TAKEN')),
      UsernameStatus.reserved => (null, t.t('error.api.USERNAME_RESERVED')),
      UsernameStatus.invalid => (null, t.t('profile.username.invalid')),
      UsernameStatus.error => (t.t('profile.username.checkFailed'), null),
    };

    String languageLabel(String code) =>
        kLanguageCatalog.where((l) => l.code == code).map((l) => l.nativeName).firstOrNull ?? code;

    final fields = <Widget>[
      // OQ-029: the name differs from the verified one — the check is
      // hidden; one tap starts "confirm new name" (ID + selfie).
      if (p.nameMismatch)
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.t('profile.nameMismatch.title'),
                  style: Theme.of(context).extension<AppTypographyTokens>()!.body.copyWith(
                        color: Theme.of(context).extension<AppColorTokens>()!.text,
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: AppSpacing.xs),
              Text(t.t('profile.nameMismatch.body'),
                  style: Theme.of(context).extension<AppTypographyTokens>()!.bodySmall.copyWith(
                        color: Theme.of(context).extension<AppColorTokens>()!.textSecondary,
                      )),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: t.t('profile.nameMismatch.action'),
                height: AppSizes.touchTarget,
                onPressed: () => context.push(AppRoutes.verificationWizard),
              ),
            ],
          ),
        ),
      AppCard(
        child: AvatarPickerField(
          initials: initialsOf(p.firstName, p.lastName, fallback: p.username),
          heroTag: attorneyAvatarHeroTag(p.username),
        ),
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
        helperText: nameChangeNeedsRecheck ? t.t('profile.edit.nameRecheck') : null,
        onChanged: (_) => setState(() {}),
      ),
      AppTextField(
        key: const ValueKey('username-field'),
        controller: _username,
        label: t.t('profile.username.label'),
        enabled: !usernameLocked,
        leading: Text('@', style: typography.body.copyWith(color: colors.textSecondary)),
        helperText: usernameHelper,
        errorText: usernameError,
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9._]')),
          LengthLimitingTextInputFormatter(30),
        ],
        onChanged: _onUsernameChanged,
      ),
      AppTextField(
        controller: _bio,
        label: t.t('onboarding.profile.bio'),
        hintText: t.t('onboarding.profile.bioHint'),
        maxLines: 4,
        maxLength: kAttorneyBioMax,
        textCapitalization: TextCapitalization.sentences,
      ),
      // Owner 2026-09-30 (OQ-030): several firms — chips + an add field.
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_firms.isNotEmpty) ...[
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final f in _firms)
                  AppChip(
                    label: f,
                    trailing: const Icon(Icons.close_rounded, size: AppSizes.iconSm),
                    onTap: () => setState(() => _firms = [..._firms]..remove(f)),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (_firms.length < kAttorneyFirmsMax)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: AppTextField(
                    controller: _firm,
                    label: t.t('onboarding.profile.firm'),
                    helperText: t.t('profile.edit.firms.helper', {'max': '$kAttorneyFirmsMax'}),
                    maxLength: kAttorneyFirmMax,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _addFirm(),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Padding(
                  // Align the button with the field (label sits above it).
                  padding: const EdgeInsets.only(top: AppSpacing.lg + AppSpacing.xs),
                  child: AppIconButton(
                    plain: false,
                    icon: const Icon(Icons.add_rounded),
                    semanticLabel: t.t('profile.edit.firms.add'),
                    onPressed: _addFirm,
                  ),
                ),
              ],
            ),
        ],
      ),
      PickerField(
        label: t.t('onboarding.profile.languages'),
        placeholder: t.t('onboarding.profile.select'),
        value: _languages.isEmpty ? null : _languages.map(languageLabel).join(', '),
        onTap: () async {
          final result = await OptionPickerSheet.show(
            context,
            title: t.t('onboarding.profile.languages'),
            options: [
              for (final l in kLanguageCatalog)
                PickerOption(value: l.code, label: l.nativeName, sublabel: l.englishName == l.nativeName ? null : l.englishName),
            ],
            initial: _languages,
            multi: true,
          );
          if (result != null) setState(() => _languages = result);
        },
      ),
      AppListSection(
        title: t.t('profile.edit.section.practice'),
        children: [
          AppListRow(
            icon: Icons.gavel_rounded,
            label: t.t('practices.title'),
            onTap: () => context.push(AppRoutes.practices),
          ),
        ],
      ),
      // Owner 2026-09-30: states are licenses — add one through the
      // verification wizard (bar number + check per state, docs/03); the
      // profile stays verified meanwhile.
      _Licenses(
        licenses: p.licenses,
        t: t,
        onAddState: () => context.push(AppRoutes.verificationWizard),
      ),
    ];

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
            children: [
              for (var i = 0; i < fields.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.lg),
                AppEntrance(index: i < 8 ? i : 8, child: fields[i]),
              ],
            ],
          ),
        ),
        _SaveBar(label: t.t('profile.edit.save'), loading: _saving, onPressed: () => _save(t)),
      ],
    );
  }
}

class _Licenses extends StatelessWidget {
  const _Licenses({required this.licenses, required this.t, required this.onAddState});

  final List<AttorneyLicense> licenses;
  final Translator t;
  final VoidCallback onAddState;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppListSection(
      title: t.t('profile.edit.section.licenses'),
      children: [
        AppListRow(
          icon: Icons.add_location_alt_outlined,
          label: t.t('profile.edit.addState'),
          onTap: onAddState,
        ),
        for (final l in licenses)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
            child: Row(
              children: [
                Icon(Icons.account_balance_outlined, size: AppSizes.iconSm, color: colors.goldStroke),
                const SizedBox(width: AppSpacing.md),
                Expanded(child: Text(l.state.name, style: typography.body.copyWith(color: colors.text))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs / 2),
                  decoration: BoxDecoration(
                    color: switch (l.status) {
                      LicenseState.verified => colors.successTint,
                      LicenseState.pending => colors.goldTint,
                      _ => colors.dangerTint,
                    },
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Text(
                    t.t('profile.license.${l.status.name}'),
                    style: typography.badge.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _SaveBar extends StatelessWidget {
  const _SaveBar({required this.label, required this.loading, required this.onPressed});

  final String label;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return DecoratedBox(
      decoration: BoxDecoration(color: colors.surface, border: Border(top: BorderSide(color: colors.border))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.md, AppSpacing.screenSide, AppSpacing.md),
          child: AppButton(key: const ValueKey('profile-save'), label: label, isLoading: loading, onPressed: onPressed),
        ),
      ),
    );
  }
}

/// Save bar shared with the client editor.
class ProfileSaveBar extends StatelessWidget {
  const ProfileSaveBar({required this.label, required this.loading, required this.onPressed, super.key});

  final String label;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => _SaveBar(label: label, loading: loading, onPressed: onPressed);
}

class _EditSkeleton extends StatelessWidget {
  const _EditSkeleton();

  @override
  Widget build(BuildContext context) => ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
        children: [
          const AppSkeletonCard(),
          for (var i = 0; i < 5; i++) ...[
            const SizedBox(height: AppSpacing.lg),
            const AppSkeleton(height: 52, borderRadius: AppRadii.field),
          ],
        ],
      );
}

/// Loading skeleton reused by the client editor.
class ProfileEditSkeleton extends StatelessWidget {
  const ProfileEditSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const _EditSkeleton();
}
