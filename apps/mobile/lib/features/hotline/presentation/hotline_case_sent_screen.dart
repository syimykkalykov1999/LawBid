import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/pop_then_push.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show stateName;
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:material_ui/material_ui.dart';

/// «Дело отправлено» over the minimised call (approved mockup v4 c11b):
/// the attorney, «topic · state», what happens now and «Вернуться к
/// звонку». The green «Вернуться к звонку» bar of the call stays on top.
class HotlineCaseSentScreen extends ConsumerWidget {
  const HotlineCaseSentScreen({super.key});

  void _back(BuildContext context, WidgetRef ref) {
    final busy = ref.read(callControllerProvider).busy;
    final nav = Navigator.maybeOf(context);
    if (busy && nav != null && nav.canPop()) {
      // The call page opens only after this one has gone (bug 27.11: a
      // push sent first went away with this page).
      unawaited(context.popThenPush<void>(ChatRoutes.call));
      return;
    }
    final router = GoRouter.of(context);
    context.safeBack();
    if (busy) unawaited(router.push<void>(ChatRoutes.call));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final f = ref.watch(hotlineControllerProvider);
    final name = f.request?.lawyer?.name ?? '';
    final d = f.draft;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: const SizedBox.shrink(),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => _back(context, ref),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          child: Column(
            key: const ValueKey('hotline-case-sent'),
            children: [
              const SizedBox(height: AppSpacing.xxxl),
              AppIcon(
                AppIcons.checkCircleRounded,
                size: 56,
                color: colors.gold,
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t('hotline.c.sent.title'),
                textAlign: TextAlign.center,
                style: type.titleLarge.copyWith(color: colors.text),
              ),
              if (name.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  name,
                  textAlign: TextAlign.center,
                  style: type.button.copyWith(color: colors.text),
                ),
              ],
              if (d != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  t.t('hotline.c.sent.case', {
                    'topic': d.topic,
                    'state': stateName(d.state),
                  }),
                  textAlign: TextAlign.center,
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t('hotline.c.sent.text'),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: AppButton(
                  key: const ValueKey('hotline-case-sent-back'),
                  label: t.t('call.returnToCall'),
                  height: 40,
                  onPressed: () => _back(context, ref),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
