import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_contact_flow_screen.dart';
import 'package:lawbid/features/settings/account/presentation/widgets/account_tile.dart';

/// Settings → "My contacts" (docs/03 §5): the confirmed phone and email
/// with their status. Changing one reuses the Account flow (re-auth + code
/// on the new contact, docs/01 §11). Clients also set the preferred way to
/// be contacted (`PATCH /users/me/contact-preferences`) — shared with an
/// attorney only after a bid is accepted.
class MyContactsScreen extends ConsumerWidget {
  const MyContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final userState = ref.watch(currentUserControllerProvider);
    final user = userState.user;

    Widget body;
    if (user == null) {
      body = userState.isOffline
          ? AppOfflineState(
              title: t.t('offline.title'), message: t.t('offline.message'))
          : const ProfileEditSkeleton();
    } else {
      Widget contactTile(ContactType type) {
        final isPhone = type == ContactType.phone;
        final value = isPhone ? user.phone : user.email;
        final verified = isPhone ? user.phoneVerified : user.emailVerified;
        return AccountTile(
          icon: isPhone
              ? AppIcons.phoneIphoneRounded
              : AppIcons.alternateEmailRounded,
          title:
              t.t(isPhone ? 'account.contact.phone' : 'account.contact.email'),
          subtitle: value == null
              ? t.t('account.contact.notSet')
              : (isPhone ? UsPhone.format(value) : value),
          badge: value == null
              ? null
              : AccountBadge(
                  label: t.t(verified
                      ? 'account.identifier.verified'
                      : 'account.contact.unverified'),
                  tone: verified
                      ? AccountBadgeTone.success
                      : AccountBadgeTone.warning,
                ),
          actionLabel:
              t.t(verified ? 'account.contact.change' : 'account.contact.add'),
          onTap: () => context
              .push(AccountRoutes.contact(type, AccountContactMode.primary)),
        );
      }

      final sections = <Widget>[
        AppListSection(
          title: t.t('contacts.section.confirmed'),
          children: [
            contactTile(ContactType.phone),
            contactTile(ContactType.email)
          ],
        ),
        _Hint(text: t.t('account.contacts.reauthHint')),
        if (user.isClient) const _ContactPreferencesSection(),
      ];
      body = RefreshIndicator(
        color: colors.gold,
        onRefresh: () async {
          ref.invalidate(clientProfileProvider);
          await ref.read(currentUserControllerProvider.notifier).load();
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
              AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
          children: [
            for (var i = 0; i < sections.length; i++) ...[
              if (i > 0) const SizedBox(height: AppSpacing.section),
              AppEntrance(index: i, child: sections[i]),
            ],
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('contacts.title')),
        leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: body,
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIcon(AppIcons.lockOutlineRounded,
            size: AppSpacing.lg, color: colors.textSecondary),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
            child: Text(text,
                style:
                    typography.caption.copyWith(color: colors.textSecondary))),
      ],
    );
  }
}

class _ContactPreferencesSection extends ConsumerWidget {
  const _ContactPreferencesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final profile = ref.watch(clientProfileProvider);
    return profile.when(
      loading: () =>
          const AppSkeleton(height: 160, borderRadius: AppRadii.card),
      error: (error, _) => AppCard(
        child: Column(
          children: [
            Text(t.t(isOfflineError(error)
                ? 'offline.message'
                : 'contacts.prefs.error')),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('error.retry'),
              icon: AppIcons.refreshRounded,
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: () => ref.invalidate(clientProfileProvider),
            ),
          ],
        ),
      ),
      data: (p) => _PreferencesForm(profile: p, t: t),
    );
  }
}

class _PreferencesForm extends ConsumerStatefulWidget {
  const _PreferencesForm({required this.profile, required this.t});

  final ClientProfileDetails profile;
  final Translator t;

  @override
  ConsumerState<_PreferencesForm> createState() => _PreferencesFormState();
}

class _PreferencesFormState extends ConsumerState<_PreferencesForm> {
  late ContactPreference? _method = widget.profile.contactMethod;
  late final _note =
      TextEditingController(text: widget.profile.contactNote ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = widget.t;
    setState(() => _saving = true);
    try {
      await ref
          .read(clientProfileRepositoryProvider)
          .updateContactPreferences(method: _method, note: _note.text);
      if (!mounted) return;
      ref.invalidate(clientProfileProvider);
      showAppSnackBar(context, t.t('contacts.prefs.saved'));
    } catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    return AppListSection(
      title: t.t('contacts.section.preferences'),
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ContactPreferenceChips(
                  value: _method,
                  onChanged: (m) => setState(() => _method = m)),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _note,
                label: t.t('onboarding.profile.contactTime'),
                hintText: t.t('onboarding.profile.contactTimeHint'),
                helperText: t.t('onboarding.profile.contactHint'),
                maxLength: 80,
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                key: const ValueKey('prefs-save'),
                label: t.t('profile.edit.save'),
                isLoading: _saving,
                height: AppSizes.touchTarget,
                onPressed: _save,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
