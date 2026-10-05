import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';

/// Owner 2026-10-05 (docs/CLIENT_FRAUD.md): the account is limited while
/// staff check it (complaints, or it is linked to a blocked account). The
/// server answers `403 ACCOUNT_RESTRICTED` to publishing a case or writing
/// to an attorney; the app then explains it once, with the way to appeal
/// (support), and never which signal matched.
class RestrictionController extends Notifier<bool> {
  @override
  bool build() => false;

  void show() => state = true;

  void clear() => state = false;
}

final restrictionProvider = NotifierProvider<RestrictionController, bool>(
  RestrictionController.new,
);

class AccountRestrictedInterceptor extends Interceptor {
  AccountRestrictedInterceptor(this._ref);

  final Ref _ref;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final e = ApiException.fromDioException(err);
    if (e.code == ApiErrorCodes.accountRestricted) {
      _ref.read(restrictionProvider.notifier).show();
    }
    handler.next(err);
  }
}

/// A card over the bottom of the screen: what is limited, «Написать в
/// поддержку», «Понятно». Buttons are stacked full-width, so a long
/// translation only wraps the text and never moves or squeezes them.
class AccountRestrictedHost extends ConsumerWidget {
  const AccountRestrictedHost({
    required this.router,
    required this.child,
    super.key,
  });

  final GoRouter router;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final show = ref.watch(restrictionProvider);
    final colors = Theme.of(context).extension<AppColorTokens>();
    final type = Theme.of(context).extension<AppTypographyTokens>();
    if (!show || colors == null || type == null) return child;
    final t = ref.watch(translatorProvider);
    void close() => ref.read(restrictionProvider.notifier).clear();
    return Stack(
      children: [
        child,
        Positioned.fill(
          child: GestureDetector(
            onTap: close,
            child: ColoredBox(color: Colors.black.withValues(alpha: 0.32)),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Material(
            key: const Key('account.restricted'),
            color: colors.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadii.card),
            ),
            child: SafeArea(
              top: false,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.8,
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.lg,
                    AppSpacing.screenSide,
                    AppSpacing.md,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppIcon(
                            AppIcons.shieldRounded,
                            size: 28,
                            color: colors.dangerText,
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Semantics(
                              header: true,
                              child: Text(
                                t.t('account.restricted.title'),
                                style: type.titleMedium
                                    .copyWith(color: colors.text),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        t.t('account.restricted.body'),
                        style: type.body.copyWith(color: colors.textSecondary),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        label: t.t('account.restricted.support'),
                        icon: AppIcons.supportAgentRounded,
                        onPressed: () {
                          close();
                          router.push(AppRoutes.supportNew);
                        },
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      AppButton(
                        label: t.t('account.restricted.ok'),
                        variant: AppButtonVariant.secondary,
                        onPressed: close,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
