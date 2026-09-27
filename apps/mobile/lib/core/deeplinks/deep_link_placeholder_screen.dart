import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../design_system/design_system.dart';
import '../l10n/l10n_providers.dart';
import '../navigation/app_routes.dart';
import 'deep_link.dart';

/// Landing screen for a `lawbid.app/case/:id`, `/lawyer/:username` or
/// `/post/:id` link (docs/01_FOUNDATION_AUTH.md §12) until the real
/// screens exist (files 03–05, see DeepLinkRoutes' TODO). A calm "coming
/// soon" state with a way back — never a crash or a blank route.
///
/// No loading/error/offline/pagination states: nothing is fetched here.
class DeepLinkPlaceholderScreen extends ConsumerWidget {
  const DeepLinkPlaceholderScreen({required this.kind, required this.id, super.key});

  final ContentKind kind;
  final String id;

  void _leave(BuildContext context) {
    // A deep link opens this screen with go(), so there is usually nothing
    // underneath — fall back to the feed.
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.feed);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final (titleKey, icon) = switch (kind) {
      ContentKind.caseItem => ('deeplink.case.title', Icons.gavel_outlined),
      ContentKind.lawyer => ('deeplink.lawyer.title', Icons.person_outline),
      ContentKind.post => ('deeplink.post.title', Icons.article_outlined),
    };
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t(titleKey)),
        leading: AppBackButton(semanticLabel: t.t('common.back'), onPressed: () => _leave(context)),
      ),
      body: AppEmptyState(
        icon: icon,
        title: t.t('deeplink.comingSoon.heading'),
        message: t.t('deeplink.comingSoon.body'),
        action: SizedBox(
          width: AppSizes.stateActionWidth,
          child: AppButton(
            label: t.t('common.back'),
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: () => _leave(context),
          ),
        ),
      ),
    );
  }
}
