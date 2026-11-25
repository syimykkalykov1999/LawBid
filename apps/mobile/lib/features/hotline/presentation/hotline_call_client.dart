import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart'
    show avatarFullUrlFor;
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/offer_case_sheet.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/hotline_routes.dart';
import 'package:lawbid/features/hotline/presentation/hotline_text.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:material_ui/material_ui.dart';

/// The client's side of a hotline call on our ordinary 1:1 voice call
/// screen (owner edits 18.11, approved mockup v4 c10b) — the only things a
/// hotline call adds there: on top «@username», the name with «›» (opens
/// the profile), «Проверенный адвокат · NV, CA», the firm, «qualification ·
/// ★ 4.9 · 212 отзывов» and the languages; the photo in the middle opens
/// full screen (the call goes on, c10p); under it «Посмотреть профиль» and
/// «Предложить дело». Everything else (time, mic, speaker, red button, the
/// minimised call) is the 1:1 call as it is. The data is the attorney's
/// public profile, already cached by the app.
class HotlineCallClientPanel extends ConsumerWidget {
  const HotlineCallClientPanel({
    required this.peer,
    required this.clock,
    required this.bottomInset,
    super.key,
  });

  final CallPeer? peer;

  /// The call's own running time / status line.
  final Widget clock;
  final double bottomInset;

  void _openProfile(BuildContext context, String username) {
    final router = GoRouter.of(context);
    // The call minimises (the green «Вернуться к звонку» bar) and the
    // profile opens over it.
    unawaited(Navigator.of(context).maybePop());
    unawaited(router.push<void>(AppRoutes.lawyer(username)));
  }

  /// «Предложить дело» (mockup c11b): one tap makes the case from the call
  /// (topic, state, qualification) and offers it to this attorney; the call
  /// minimises and «Дело отправлено» opens over it. A server without that
  /// step, or one that needs more (contact consent, a missing contact),
  /// gets the app's ordinary «Предложить дело» sheet instead.
  Future<void> _offer(
    BuildContext context,
    WidgetRef ref, {
    required String attorneyId,
    required String name,
    required Set<String> states,
    required Set<String> practices,
  }) async {
    final router = GoRouter.of(context);
    final t = ref.read(translatorProvider);
    final res = await ref.read(hotlineControllerProvider.notifier).offerCase();
    if (!context.mounted) return;
    if (res.caseId != null) {
      unawaited(context.maybePopIfCurrent<void>());
      unawaited(router.push<void>(HotlineRoutes.caseSent));
      return;
    }
    if (res.code == ApiErrorCodes.rateLimited ||
        res.code == ApiErrorCodes.featureDisabled ||
        res.code == 'NETWORK') {
      final text = hotlineErrorText(t, res.code);
      if (text != null) showAppSnackBar(context, text);
      return;
    }
    await showOfferCaseSheet(
      context,
      attorneyId: attorneyId,
      attorneyName: name,
      licensedStateCodes: states,
      practiceIds: practices,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final flow = ref.watch(hotlineControllerProvider);
    final lawyer = flow.request?.lawyer;
    final username = lawyer?.username ?? peer?.username;
    final profile = username == null
        ? null
        : ref.watch(publicAttorneyProfileProvider(username)).value;
    final langs = hotlineLanguages(ref);
    final name = (profile?.fullName.isNotEmpty ?? false)
        ? profile!.fullName
        : (lawyer?.name ?? peer?.name ?? '');
    final photo = profile?.avatarUrl ?? lawyer?.avatarUrl ?? peer?.avatarUrl;
    final practice = flow.draft?.practice;
    final rating = profile?.rating;
    final small = type.body.copyWith(
      color: AppCallColors.onStage.withValues(alpha: 0.85),
      fontSize: CallTextSizes.status,
    );
    final top = MediaQuery.paddingOf(context).top + 56;
    return Padding(
      padding: EdgeInsets.only(top: top, bottom: bottomInset),
      child: Column(
        children: [
          Padding(
            key: const ValueKey('hotline-call-info'),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            child: Column(
              children: [
                if (username != null)
                  Text(
                    '@$username',
                    style: small.copyWith(
                      color: AppCallColors.onStage.withValues(alpha: 0.75),
                    ),
                  ),
                Semantics(
                  button: username != null,
                  child: GestureDetector(
                    key: const ValueKey('hotline-call-name'),
                    behavior: HitTestBehavior.opaque,
                    onTap: username == null
                        ? null
                        : () => _openProfile(context, username),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: AppSpacing.xs,
                      ),
                      child: Text(
                        username == null ? name : '$name ›',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(
                          color: AppCallColors.onStage,
                          fontWeight: FontWeight.w600,
                          fontSize: CallTextSizes.title,
                        ),
                      ),
                    ),
                  ),
                ),
                if (profile != null && profile.licensedStates.isNotEmpty)
                  Text(
                    t.t('hotline.c.call.verified', {
                      'states':
                          profile.licensedStates.map((s) => s.code).join(', '),
                    }),
                    textAlign: TextAlign.center,
                    style: small.copyWith(color: colors.goldLight),
                  ),
                if (profile?.firmName?.isNotEmpty ?? false)
                  Text(profile!.firmName!, style: small),
                if (practice != null && rating != null && !rating.isNew)
                  Text(
                    t.t('hotline.c.call.rating', {
                      'practice': practiceLabel(ref, practice),
                      'rating': rating.average!.toStringAsFixed(1),
                      'reviews': t.plural('reviews.authorCount', rating.count),
                    }),
                    textAlign: TextAlign.center,
                    style: small,
                  )
                else if (practice != null)
                  Text(practiceLabel(ref, practice), style: small),
                if (profile != null && profile.languages.isNotEmpty)
                  Text(
                    profile.languages
                        .map((c) => hotlineLanguageName(langs, c))
                        .join(', '),
                    textAlign: TextAlign.center,
                    style: small,
                  ),
              ],
            ),
          ),
          const Spacer(),
          Semantics(
            button: photo != null,
            label: t.t('hotline.c.call.photo'),
            child: GestureDetector(
              key: const ValueKey('hotline-call-photo'),
              onTap: photo == null
                  ? null
                  : () => unawaited(
                        showPhotoGallery(
                          context,
                          urls: [
                            avatarFullUrlFor(
                              photo,
                              fullUrl: peer?.avatarFullUrl,
                            ),
                          ],
                          previews: [photo],
                          closeLabel: t.t('common.close'),
                        ),
                      ),
              child: CallAvatar(peer: peer, size: 132),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          clock,
          const Spacer(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.xl,
              0,
              AppSpacing.xl,
              AppSpacing.md,
            ),
            child: Row(
              children: [
                Expanded(
                  child: _CallButton(
                    key: const ValueKey('hotline-call-profile'),
                    label: t.t('hotline.c.call.profile'),
                    background: AppCallColors.pill,
                    foreground: AppCallColors.onStage,
                    onTap: username == null
                        ? null
                        : () => _openProfile(context, username),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _CallButton(
                    key: const ValueKey('hotline-call-offer'),
                    label: t.t('invite.offer.button'),
                    background: colors.gold,
                    foreground: colors.navy,
                    onTap: lawyer == null
                        ? null
                        : () => unawaited(
                              _offer(
                                context,
                                ref,
                                attorneyId: lawyer.id,
                                name: name,
                                states: {
                                  for (final s in profile?.licensedStates ??
                                      const <StateRef>[])
                                    s.code,
                                },
                                practices: {
                                  for (final p in profile?.practices ??
                                      const <SelectedPractice>[])
                                    p.id,
                                },
                              ),
                            ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A wide button on the call's dark stage (mockup c10b): the call's own
/// translucent pill, or the brand gold for «Предложить дело».
class _CallButton extends StatelessWidget {
  const _CallButton({
    required this.label,
    required this.background,
    required this.foreground,
    required this.onTap,
    super.key,
  });

  final String label;
  final Color background;
  final Color foreground;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      enabled: onTap != null,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          height: AppSizes.touchTarget,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          decoration: BoxDecoration(
            color: onTap == null
                ? background.withValues(alpha: AppSizes.disabledOpacity)
                : background,
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.button.copyWith(color: foreground),
          ),
        ),
      ),
    );
  }
}
