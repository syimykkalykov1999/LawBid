import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-15: the "+" opens a small sheet — «Пост» (photo, video or
/// just text: the type is decided by what is attached) and, for a client,
/// «Кейс». A task lives only in Mine; an assistant keeps the full chooser.
Future<void> showCreateSheet(BuildContext context, WidgetRef ref) {
  if (ref.read(isAssistantProvider)) {
    context.push(AppRoutes.create);
    return Future.value();
  }
  final client = ref.read(currentUserRoleProvider) == UserRole.client;
  // Owner 2026-10-15: an attorney has one choice — «Post» — so «+» goes
  // straight to the post screen, no sheet with a single row.
  if (!client) {
    context.push(AppRoutes.create);
    return Future.value();
  }
  return showAppBottomSheet<void>(
    context: context,
    builder: (ctx) => _CreateSheet(
      client: client,
      onPick: (route) {
        Navigator.of(ctx).pop();
        context.push(route);
      },
    ),
  );
}

class _CreateSheet extends ConsumerWidget {
  const _CreateSheet({required this.client, required this.onPick});

  final bool client;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget option(IconData icon, String title, String sub, String route) =>
        Semantics(
          button: true,
          label: '$title. $sub',
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => onPick(route),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 56),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    Container(
                      width: AppSizes.rowMedallion,
                      height: AppSizes.rowMedallion,
                      decoration: BoxDecoration(
                        color: colors.iconTintFill,
                        shape: BoxShape.circle,
                        border: Border.all(color: colors.iconTint),
                      ),
                      child: AppIcon(
                        icon,
                        color: colors.iconTint,
                        size: AppSizes.iconMd,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: type.body.copyWith(
                              color: colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            sub,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Text(
              t.t('create.title'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            option(
              AppIcons.editNoteRounded,
              t.t('create.sheet.post'),
              t.t('create.sheet.postSub'),
              AppRoutes.create,
            ),
            if (client)
              option(
                AppIcons.gavelRounded,
                t.t('create.sheet.case'),
                t.t('create.sheet.caseSub'),
                '${AppRoutes.create}?kind=case',
              ),
          ],
        ),
      ),
    );
  }
}
