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
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/settings/account/application/account_providers.dart';
import 'package:lawbid/features/settings/account/domain/account_identifier.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_contact_flow_screen.dart';
import 'package:lawbid/features/settings/account/presentation/widgets/account_tile.dart';

/// Settings → Account (docs/01 §10.3): the account's phone/email contact
/// (change = reauth + code on the new contact, §11 3A), every linked
/// sign-in method, and linking another phone / email / Apple / Google via
/// `POST /auth/identifiers`.
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  /// Apple/Google linking in flight (native sheet + POST).
  IdentifierProvider? _linking;

  Future<void> _linkSocial(Translator t, IdentifierProvider provider) async {
    if (_linking != null) return;
    setState(() => _linking = provider);
    try {
      final outcome = await ref
          .read(accountIdentifiersProvider.notifier)
          .linkSocial(provider);
      if (!mounted) return;
      if (outcome == SocialLinkOutcome.linked) {
        showAppSnackBar(context, t.t('account.link.success'));
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _linking = null);
    }
  }

  Future<void> _openFlow(ContactType type, AccountContactMode mode) async {
    await context.push<void>(AccountRoutes.contact(type, mode));
    if (mounted) {
      await ref.read(accountIdentifiersProvider.notifier).reloadQuietly();
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final identifiers = ref.watch(accountIdentifiersProvider);
    final user = ref.watch(currentUserControllerProvider).user;
    Future<void> retry() =>
        ref.read(accountIdentifiersProvider.notifier).refresh();

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('account.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: identifiers.when(
        skipLoadingOnReload: true,
        loading: () => const _AccountLoading(),
        error: (error, _) {
          if (isOfflineError(error)) {
            return AppOfflineState(
              title: t.t('offline.title'),
              message: t.t('offline.message'),
              action: AppButton(
                label: t.t('error.retry'),
                icon: Icons.refresh_rounded,
                variant: AppButtonVariant.secondary,
                height: AppSizes.touchTarget,
                onPressed: retry,
              ),
            );
          }
          return AppErrorState(
            message: t.t('account.error'),
            retryLabel: t.t('error.retry'),
            onRetry: retry,
          );
        },
        data: (items) => RefreshIndicator(
          color: colors.gold,
          onRefresh: retry,
          child: _AccountBody(
            t: t,
            user: user,
            identifiers: items,
            linking: _linking,
            onContact: _openFlow,
            onLinkSocial: (p) => _linkSocial(t, p),
          ),
        ),
      ),
    );
  }
}

class _AccountBody extends StatelessWidget {
  const _AccountBody({
    required this.t,
    required this.user,
    required this.identifiers,
    required this.linking,
    required this.onContact,
    required this.onLinkSocial,
  });

  final Translator t;
  final CurrentUser? user;
  final List<AccountIdentifier> identifiers;
  final IdentifierProvider? linking;
  final void Function(ContactType, AccountContactMode) onContact;
  final void Function(IdentifierProvider) onLinkSocial;

  bool _has(IdentifierProvider p) => identifiers.any((i) => i.provider == p);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final phoneVerified = user?.phoneVerified ?? false;
    final emailVerified = user?.emailVerified ?? false;
    final busy = linking != null;

    Widget contactTile(ContactType type) {
      final isPhone = type == ContactType.phone;
      final value = isPhone ? user?.phone : user?.email;
      final verified = isPhone ? phoneVerified : emailVerified;
      final shown = value == null
          ? t.t('account.contact.notSet')
          : (isPhone ? UsPhone.format(value) : value);
      return AccountTile(
        icon: isPhone
            ? Icons.phone_iphone_rounded
            : Icons.alternate_email_rounded,
        title: t.t(isPhone ? 'account.contact.phone' : 'account.contact.email'),
        subtitle: shown,
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
        onTap: busy ? null : () => onContact(type, AccountContactMode.primary),
      );
    }

    final sections = <Widget>[
      Text(
        t.t('account.intro'),
        style: typography.body.copyWith(color: colors.textSecondary),
      ),
      AppListSection(
        title: t.t('account.section.contacts'),
        children: [
          contactTile(ContactType.phone),
          contactTile(ContactType.email),
        ],
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.lock_outline_rounded,
                size: AppSpacing.lg, color: colors.textSecondary),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('account.contacts.reauthHint'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
      ),
      AppListSection(
        title: t.t('account.section.signIn'),
        children: identifiers.isEmpty
            ? [
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Row(
                    children: [
                      const AppIconMedallion(
                        icon: Icons.key_off_rounded,
                        tone: AppMedallionTone.neutral,
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Text(
                          t.t('account.identifiers.empty'),
                          style: typography.body
                              .copyWith(color: colors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ),
              ]
            : [
                for (final i in identifiers)
                  _IdentifierTile(t: t, identifier: i)
              ],
      ),
      AppListSection(
        title: t.t('account.section.link'),
        children: [
          AccountTile(
            icon: Icons.add_call,
            title: t.t('account.link.phone'),
            onTap: busy
                ? null
                : () => onContact(
                      ContactType.phone,
                      phoneVerified
                          ? AccountContactMode.link
                          : AccountContactMode.primary,
                    ),
          ),
          AccountTile(
            icon: Icons.mark_email_unread_outlined,
            title: t.t('account.link.email'),
            onTap: busy
                ? null
                : () => onContact(
                      ContactType.email,
                      emailVerified
                          ? AccountContactMode.link
                          : AccountContactMode.primary,
                    ),
          ),
          if (!_has(IdentifierProvider.apple))
            AccountTile(
              glyph: const AppleGlyph(),
              title: t.t('account.link.apple'),
              loading: linking == IdentifierProvider.apple,
              onTap: busy ? null : () => onLinkSocial(IdentifierProvider.apple),
            ),
          if (!_has(IdentifierProvider.google))
            AccountTile(
              glyph: const GoogleGlyph(),
              title: t.t('account.link.google'),
              loading: linking == IdentifierProvider.google,
              onTap:
                  busy ? null : () => onLinkSocial(IdentifierProvider.google),
            ),
        ],
      ),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        for (var i = 0; i < sections.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.section),
          AppEntrance(index: i, child: sections[i]),
        ],
      ],
    );
  }
}

class _IdentifierTile extends StatelessWidget {
  const _IdentifierTile({required this.t, required this.identifier});

  final Translator t;
  final AccountIdentifier identifier;

  @override
  Widget build(BuildContext context) {
    final i = identifier;
    final title = t.t('account.identifier.${i.provider.name}');
    final value = i.value;
    final subtitle = value == null
        ? t.t('account.identifier.linked')
        : (i.provider == IdentifierProvider.phone
            ? UsPhone.format(value)
            : value);
    return AccountTile(
      icon: switch (i.provider) {
        IdentifierProvider.phone => Icons.phone_iphone_rounded,
        IdentifierProvider.email => Icons.alternate_email_rounded,
        _ => null,
      },
      glyph: switch (i.provider) {
        IdentifierProvider.apple => const AppleGlyph(),
        IdentifierProvider.google => const GoogleGlyph(),
        _ => null,
      },
      title: title,
      subtitle: subtitle,
      badge: i.isPrimaryContact
          ? AccountBadge(
              label: t.t('account.identifier.primary'),
              tone: AccountBadgeTone.gold)
          : (i.verified
              ? AccountBadge(
                  label: t.t('account.identifier.verified'),
                  tone: AccountBadgeTone.success)
              : null),
    );
  }
}

class _AccountLoading extends ConsumerWidget {
  const _AccountLoading();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      label: ref.watch(translatorProvider).t('account.loading'),
      child: ListView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        children: const [
          FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: 0.7,
            child: AppSkeleton(),
          ),
          SizedBox(height: AppSpacing.section),
          AppSkeletonCard(),
          SizedBox(height: AppSpacing.md),
          AppSkeletonCard(),
          SizedBox(height: AppSpacing.section),
          AppSkeletonCard(),
          SizedBox(height: AppSpacing.md),
          AppSkeletonCard(),
        ],
      ),
    );
  }
}
