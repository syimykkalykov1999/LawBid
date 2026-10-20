import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/consultations_routes.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/features/consultations/presentation/consultation_widgets.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-20 — «Консультации»: upcoming, requests, past. The
/// attorney also gets the booking hours from here.
class ConsultationsScreen extends ConsumerStatefulWidget {
  const ConsultationsScreen({super.key});

  @override
  ConsumerState<ConsultationsScreen> createState() =>
      _ConsultationsScreenState();
}

class _ConsultationsScreenState extends ConsumerState<ConsultationsScreen> {
  ConsultationView _view = ConsultationView.upcoming;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney &&
        !ref.watch(isAssistantProvider);
    final value = ref.watch(consultationsListProvider(_view));
    final notifier = ref.read(consultationsListProvider(_view).notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('consult.title')),
        actions: [
          if (attorney)
            IconButton(
              tooltip: t.t('consult.hours'),
              icon: const AppIcon(AppIcons.scheduleRounded),
              onPressed: () => context.push(ConsultationsRoutes.settings),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.sm,
              AppSpacing.screenSide,
              0,
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final v in ConsultationView.values) ...[
                    if (v != ConsultationView.upcoming)
                      const SizedBox(width: AppSpacing.xs),
                    AppChip(
                      key: ValueKey('consult-tab-${v.name}'),
                      label: t.t('consult.tab.${v.name}'),
                      selected: _view == v,
                      onTap: () => setState(() => _view = v),
                    ),
                  ],
                ],
              ),
            ),
          ),
          Expanded(
            child: PagedListBody<Consultation>(
              value: value,
              t: t,
              itemKey: (c) => c.id,
              itemBuilder: (context, c, index) => AppEntrance(
                index: index.clamp(0, 6),
                child: ConsultationTile(
                  consultation: c,
                  t: t,
                  formats: f,
                  onTap: () async {
                    await context.push(ConsultationsRoutes.detail(c.id));
                    ref.invalidate(consultationsListProvider);
                  },
                ),
              ),
              empty: AppEmptyState(
                icon: AppIcons.eventAvailableOutlined,
                title: t.t('consult.empty.${_view.name}'),
                message: t.t(
                  attorney ? 'consult.empty.attorney' : 'consult.empty.client',
                ),
              ),
              onRefresh: notifier.refresh,
              onLoadMore: notifier.loadMore,
              onRetryMore: notifier.retryLoadMore,
            ),
          ),
        ],
      ),
    );
  }
}
