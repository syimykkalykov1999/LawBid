import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/auth/auth_routes.dart';

/// Owner 2026-10-22 (guest browsing, checklist §7): the one gate every
/// action goes through. Signed in → true, do the thing. A guest → the
/// current location is remembered ([guestReturnProvider]), the sign-in
/// flow opens on top, and false comes back so the caller does nothing.
/// After sign-in (and onboarding) the router guard returns the person to
/// the remembered screen.
bool requireSignIn(BuildContext context, WidgetRef ref, {String? returnTo}) {
  if (!ref.read(isGuestProvider)) return true;
  openSignIn(context, ref, returnTo: returnTo);
  return false;
}

/// The same gate for helpers that only have a [BuildContext] (bottom
/// sheets opened from a card).
bool requireSignInFromContext(BuildContext context) {
  final container = ProviderScope.containerOf(context, listen: false);
  if (!container.read(isGuestProvider)) return true;
  _open(context, container, null);
  return false;
}

/// Opens the sign-in flow for a guest, remembering where to come back.
void openSignIn(BuildContext context, WidgetRef ref, {String? returnTo}) =>
    _open(context, ProviderScope.containerOf(context, listen: false), returnTo);

void _open(
  BuildContext context,
  ProviderContainer container,
  String? returnTo,
) {
  var location = returnTo;
  if (location == null) {
    try {
      location = GoRouter.of(context).state.uri.toString();
    } catch (_) {
      location = null;
    }
  }
  if (location == null ||
      location == AppRoutes.splash ||
      location.startsWith('/auth/') ||
      location == AuthRoutes.welcome) {
    location = AppRoutes.feed;
  }
  container.read(guestReturnProvider.notifier).set(location);
  context.push(AuthRoutes.welcome);
}

/// Owner 2026-10-22: the persistent small «Sign in» strip a guest sees
/// above the tab bar (Instagram's logged-out web has the same).
class GuestSignInBar extends ConsumerWidget {
  const GuestSignInBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: colors.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.screenSide,
            AppSpacing.xs,
            AppSpacing.sm,
            AppSpacing.xs,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t.t('guest.bar.text'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 140),
                child: AppButton(
                  key: const ValueKey('guest-sign-in'),
                  label: t.t('guest.signIn'),
                  height: 32,
                  onPressed: () => openSignIn(context, ref),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A whole screen (Mine, Profile, an account-only view) for a guest: what
/// is here and one «Sign in» button.
class GuestGateView extends ConsumerWidget {
  const GuestGateView({super.key, this.message});

  /// Replaces the generic text when the screen has a better one.
  final String? message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppEmptyState(
      key: const ValueKey('guest-gate'),
      icon: AppIcons.personOutlineRounded,
      title: t.t('guest.gate.title'),
      message: message ?? t.t('guest.gate.message'),
      action: AppButton(
        label: t.t('guest.signIn'),
        height: AppSizes.touchTarget,
        onPressed: () => openSignIn(context, ref),
      ),
    );
  }
}
