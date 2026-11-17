import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_gate_view.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_sheet.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/settings/data_export/application/data_export_providers.dart';
import 'package:lawbid/features/settings/data_export/data/data_export_repository.dart';

/// docs/06 §5.2 / docs/01 §10.7 — Settings → «Скачать мои данные»: behind
/// the reauth gate, one button queues the ZIP; the status card follows the
/// job (queued → processing → ready with a 24-hour link, also emailed).
class DataExportScreen extends ConsumerWidget {
  const DataExportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final access = ref.watch(historyAccessProvider);
    // R2B-12 (14.11): an export already asked for stays on screen when the
    // 5-minute reauth runs out (or the download sheet asks again): the gate
    // guards a new request and the link, not the status.
    final hasJob = ref.watch(
      dataExportControllerProvider.select((s) => s.value != null),
    );
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
        title: Text(t.t('settings.downloadData')),
      ),
      body: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stepSwitch,
        child: access.isOpen || hasJob
            ? const _ExportBody(key: ValueKey('export'))
            : ReauthGateView(
                key: const ValueKey('reauth'),
                access: access,
                t: t,
                note: t.t('dataExport.reauthNote'),
              ),
      ),
    );
  }
}

class _ExportBody extends ConsumerWidget {
  const _ExportBody({super.key});

  /// Detective R2B-12 (14.11): the link is read with a fresh reauth — the
  /// gate's token while it lasts, else the reauth sheet first (Google
  /// Takeout asks again before a download). A token the server refuses
  /// opens the sheet once more.
  Future<void> _download(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final controller = ref.read(dataExportControllerProvider.notifier);
    var token = controller.freshToken;
    String? url;
    for (var attempt = 0; attempt < 2 && url == null; attempt++) {
      if (token == null) {
        if (!context.mounted) return;
        token = await showReauthSheet(
          context,
          note: t.t('dataExport.reauthNote'),
        );
      }
      if (token == null || !context.mounted) return;
      try {
        url = await controller.linkWith(token);
        if (url == null) break;
      } on Object catch (e) {
        if (!context.mounted) return;
        if (!DataExportController.isReauthError(e)) {
          showAppSnackBar(context, errorText(t, e));
          return;
        }
        token = null;
      }
    }
    if (!context.mounted) return;
    if (url == null) {
      showAppSnackBar(context, t.t('dataExport.cantOpen'));
      return;
    }
    final uri = Uri.tryParse(url);
    final launch = ref.read(dataExportLauncherProvider);
    if (uri == null || uri.scheme != 'https' || !await launch(uri)) {
      if (context.mounted) {
        showAppSnackBar(context, t.t('dataExport.cantOpen'));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(dataExportControllerProvider);
    final job = state.value;
    // Admin «Вход и письма по почте» off: the link is not e-mailed.
    final email = ref.watch(emailFlowsEnabledProvider)
        ? ref.watch(
            currentUserControllerProvider.select((s) => s.user?.email),
          )
        : null;
    final busy = state.isLoading || (job?.status.inProgress ?? false);
    final items = [
      'dataExport.includes.profile',
      'dataExport.includes.cases',
      'dataExport.includes.social',
      'dataExport.includes.messages',
      'dataExport.includes.devices',
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        AppEntrance(
          child: AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const AppIconMedallion(icon: AppIcons.folderZipOutlined),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Text(
                        t.t('dataExport.title'),
                        style:
                            typography.titleMedium.copyWith(color: colors.text),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  t.t('dataExport.intro'),
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.md),
                for (final (i, key) in items.indexed) ...[
                  if (i > 0) const SizedBox(height: AppSpacing.xs),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: ExcludeSemantics(
                          child: AppIcon(
                            AppIcons.checkRounded,
                            size: AppSizes.iconSm,
                            color: colors.iconTint,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          t.t(key),
                          style:
                              typography.bodySmall.copyWith(color: colors.text),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                Text(
                  email == null
                      ? t.t('dataExport.linkNoEmail')
                      : t.t('dataExport.link', {'email': email}),
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (job != null) ...[
          AppEntrance(
            index: 1,
            child: _StatusCard(
              job: job,
              t: t,
              formats: formats,
              onDownload: () => _download(context, ref),
              onRefresh: () =>
                  ref.read(dataExportControllerProvider.notifier).refresh(),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        if (state.hasError) ...[
          Text(
            errorText(t, state.error!),
            key: const ValueKey('export-error'),
            textAlign: TextAlign.center,
            style: typography.bodySmall.copyWith(color: colors.dangerText),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        AppEntrance(
          index: 2,
          child: AppButton(
            key: const ValueKey('request-export'),
            label: t.t(
              job == null || job.status.inProgress || state.hasError
                  ? 'dataExport.request'
                  : 'dataExport.requestAgain',
            ),
            icon: AppIcons.downloadRounded,
            isLoading: busy,
            onPressed: busy
                ? null
                : () =>
                    ref.read(dataExportControllerProvider.notifier).request(),
          ),
        ),
      ],
    );
  }
}

StatusTone exportTone(DataExportStatus s) => switch (s) {
      DataExportStatus.ready => StatusTone.success,
      DataExportStatus.failed => StatusTone.danger,
      DataExportStatus.expired => StatusTone.neutral,
      DataExportStatus.queued ||
      DataExportStatus.processing ||
      DataExportStatus.unknown =>
        StatusTone.info,
    };

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.job,
    required this.t,
    required this.formats,
    required this.onDownload,
    required this.onRefresh,
  });

  final DataExport job;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onDownload;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final line = switch (job.status) {
      DataExportStatus.queued ||
      DataExportStatus.processing =>
        t.t('dataExport.status.line.processing'),
      DataExportStatus.ready when job.expiresAt != null => t.t(
          'dataExport.status.line.ready',
          {'date': formats.dateTime(job.expiresAt!)},
        ),
      DataExportStatus.ready => t.t('dataExport.status.line.readyNoDate'),
      DataExportStatus.failed => t.t('dataExport.status.line.failed'),
      DataExportStatus.expired => t.t('dataExport.status.line.expired'),
      DataExportStatus.unknown => '',
    };
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('dataExport.status.title'),
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              // Capped: the pill ellipsizes instead of squeezing the title.
              AppTrailingCap(
                child: StatusPill(
                  key: const ValueKey('export-status'),
                  label: t.t('dataExport.status.${job.status.name}'),
                  tone: exportTone(job.status),
                ),
              ),
            ],
          ),
          if (line.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              line,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
          ],
          // R2B-12: shown for a ready export with or without the link —
          // the link itself is read after the reauth (see _download).
          if (job.status == DataExportStatus.ready) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('download-export'),
              label: t.t('dataExport.download'),
              icon: AppIcons.openInNewRounded,
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: onDownload,
            ),
          ],
          if (job.status.inProgress) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('refresh-export'),
              label: t.t('subscription.action.refresh'),
              icon: AppIcons.refreshRounded,
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: onRefresh,
            ),
          ],
        ],
      ),
    );
  }
}
