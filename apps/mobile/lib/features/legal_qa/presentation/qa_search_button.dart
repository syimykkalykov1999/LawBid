import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';

/// Owner 2026-10-20: the «?» inside the Search field (next to the QR
/// scanner and the magnifier) that opens «Вопрос юристу». Hidden while the
/// `legal_qa` flag is off.
class QaSearchButton extends ConsumerWidget {
  const QaSearchButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(legalQaEnabledProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AppIconButton(
      key: const ValueKey('search-qa'),
      compact: true,
      icon: AppIcon(AppIcons.helpOutlineRounded, color: colors.goldDark),
      semanticLabel: t.t('qa.title'),
      onPressed: () => context.push(LegalQaRoutes.feed),
    );
  }
}
