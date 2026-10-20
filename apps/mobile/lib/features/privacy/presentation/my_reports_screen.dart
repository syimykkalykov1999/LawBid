import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';

/// Owner 2026-10-20: Settings → Privacy → «My reports»: what I reported
/// and where it stands (under review / action taken / no violation found).
class MyReportsScreen extends ConsumerWidget {
  const MyReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final list = ref.watch(myReportsProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('privacy.myReports')),
      ),
      body: AsyncDetailBody<List<MyReport>>(
        value: list,
        t: t,
        onRetry: () => ref.invalidate(myReportsProvider),
        builder: (reports) => reports.isEmpty
            ? AppEmptyState(
                icon: AppIcons.flagOutlined,
                message: t.t('reports.mine.empty'),
              )
            : ListView.separated(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.md,
                  AppSpacing.screenSide,
                  AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
                ),
                itemCount: reports.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppSpacing.sm),
                itemBuilder: (context, i) {
                  final r = reports[i];
                  final done = r.status != 'open';
                  return AppCard(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                t.t('report.reason.${r.reason}'),
                                style: type.body.copyWith(
                                  color: colors.text,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: AppSpacing.xs),
                              Text(
                                f.date(r.createdAt.toLocal()),
                                style: type.caption
                                    .copyWith(color: colors.textSecondary),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Flexible(
                          child: AppChip(
                            label: t.t('reports.mine.status.${r.status}'),
                            selected: done,
                            fitLabel: true,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
