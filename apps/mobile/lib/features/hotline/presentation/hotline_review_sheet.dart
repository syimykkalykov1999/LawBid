import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:material_ui/material_ui.dart';

/// After the call (owner answer 16.11 q. 7, like Uber; mockup v4 c12): «Как
/// прошёл разговор?», five stars, an optional comment ≤ 300, «Отправить»,
/// «Написать адвокату» (the direct chat the server opened, WhatsApp-style)
/// and «Пропустить». Optional: closing it is the same as «Пропустить».
Future<void> showHotlineReviewSheet(
  BuildContext context, {
  required GoRouter router,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => HotlineReviewSheet(router: router),
    );

class HotlineReviewSheet extends ConsumerStatefulWidget {
  const HotlineReviewSheet({required this.router, super.key});

  final GoRouter router;

  @override
  ConsumerState<HotlineReviewSheet> createState() => _HotlineReviewSheetState();
}

class _HotlineReviewSheetState extends ConsumerState<HotlineReviewSheet> {
  final _comment = TextEditingController();
  int _stars = 0;
  late final String? _chat =
      ref.read(hotlineControllerProvider).review?.conversationId;

  @override
  void dispose() {
    // Closed without «Отправить»: nothing is sent (the review is optional).
    final c = ref.read(hotlineControllerProvider.notifier);
    if (ref.read(hotlineControllerProvider).review != null) c.dismissReview();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    final ok = await ref
        .read(hotlineControllerProvider.notifier)
        .sendReview(_stars, _comment.text);
    if (!mounted) return;
    context.popIfCurrent<void>();
    if (ok) showAppSnackBar(context, t.t('hotline.c.review.thanks'));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = _chat;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t('hotline.c.review.title'),
              textAlign: TextAlign.center,
              style: type.titleLarge.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  AppIconButton(
                    key: ValueKey('hotline-star-$i'),
                    icon: AppIcon(
                      i <= _stars
                          ? AppIcons.starRounded
                          : AppIcons.starOutlineRounded,
                      size: 34,
                      color: colors.gold,
                    ),
                    semanticLabel: t.t(
                      'hotline.c.review.star',
                      {'count': '$i'},
                    ),
                    onPressed: () => setState(() => _stars = i),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: const ValueKey('hotline-review-comment'),
              controller: _comment,
              hintText: t.t('hotline.c.review.comment'),
              semanticLabel: t.t('hotline.c.review.comment'),
              maxLength: 300,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('hotline-review-send'),
              label: t.t('hotline.c.review.send'),
              height: 40,
              isEnabled: _stars > 0,
              onPressed: () => unawaited(_send()),
            ),
            if (chat != null) ...[
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('hotline-review-write'),
                label: t.t('hotline.c.review.write'),
                variant: AppButtonVariant.secondary,
                height: 40,
                onPressed: () {
                  Navigator.of(context).pop();
                  unawaited(
                    widget.router.push<void>(ChatRoutes.conversation(chat)),
                  );
                },
              ),
            ],
            TextButton(
              key: const ValueKey('hotline-review-skip'),
              onPressed: () => Navigator.of(context).pop(),
              child: Text(
                t.t('hotline.c.review.skip'),
                style: type.button.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
