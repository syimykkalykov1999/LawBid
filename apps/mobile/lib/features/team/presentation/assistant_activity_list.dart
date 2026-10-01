import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';

/// Owner 2026-10-01: everything the assistants did, as cards grouped by
/// day — shown under the bell ("Assistants"), not in Team.
class AssistantActivityList extends ConsumerWidget {
  const AssistantActivityList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(teamActivityProvider);
    final items = value.value?.items ?? const <ActivityEntry>[];
    final tr = ref.watch(translatorProvider);
    if (value.isLoading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (items.isEmpty) {
      return PullableState(
        child: AppEmptyState(
          icon: AppIcons.historyRounded,
          message: tr.t('team.activity.empty'),
        ),
      );
    }
    return RefreshIndicator(
      color: colors.gold,
      backgroundColor: colors.surface,
      onRefresh: () => ref.read(teamActivityProvider.notifier).refresh(),
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 400) {
            ref.read(teamActivityProvider.notifier).loadMore();
          }
          return false;
        },
        child: ListView.builder(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          itemCount: items.length,
          itemBuilder: (_, i) {
            final day = DateUtils.dateOnly(items[i].createdAt.toLocal());
            final prev = i == 0
                ? null
                : DateUtils.dateOnly(items[i - 1].createdAt.toLocal());
            final today = DateUtils.dateOnly(DateTime.now());
            final label = day == today
                ? tr.t('tasks.today')
                : day == today.subtract(const Duration(days: 1))
                    ? tr.t('tasks.yesterday')
                    : formats.dateLong(day);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (prev != day) ActivityDayHeader(label: label),
                ActivityRow(entry: items[i], t: tr, formats: formats),
              ],
            );
          },
        ),
      ),
    );
  }
}
