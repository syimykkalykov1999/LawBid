import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/deals/deal_record_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:url_launcher/url_launcher.dart';

/// Deal record 2026-10-27 (plan §7): the one card "Deal record" — at the top
/// of the Docs tab and, compact, on the case overview. Status, the terms,
/// the PDF (Save → Open, Print) and the attorney's own agreement. Nothing is
/// shown while the switch is off or the case has no record.
class DealRecordCard extends ConsumerWidget {
  const DealRecordCard({
    required this.caseId,
    required this.isAttorney,
    this.compact = false,
    super.key,
  });

  final String caseId;
  final bool isAttorney;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(caseDealRecordProvider(caseId));
    final r = value.value;
    if (r == null) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final live = r.status == api.DealRecordStatus.preparing ||
        r.status == api.DealRecordStatus.awaitingSignatures;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.xs,
      ),
      child: AppCard(
        onTap: () => context.push(AppRoutes.dealRecord(r.id)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                AppIcon(
                  AppIcons.handshakeOutlined,
                  size: 18,
                  color: colors.gold,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(t.t('deal.title'), style: type.titleMedium),
                ),
                StatusPill(
                  label: DealRecordFormat.statusLabel(t, r),
                  tone: DealRecordFormat.statusTone(r),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${DealRecordFormat.termsLines(t, formats, r.terms).first} · '
              '${formats.date(r.acceptedAt.toLocal())}',
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            if (!compact && !live) ...[
              const SizedBox(height: AppSpacing.md),
              DealRecordFiles(record: r),
              if (isAttorney &&
                  r.status == api.DealRecordStatus.valueSealed &&
                  r.agreementFileId == null) ...[
                const SizedBox(height: AppSpacing.sm),
                _AttachAgreement(record: r),
              ],
            ],
            if (live && r.myTurnToSign) ...[
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: t.t('deal.confirm'),
                height: 40,
                onPressed: () => context.push(AppRoutes.dealRecord(r.id)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The sealed PDF (or, before sealing, the unsigned one) with Save → Open
/// and Print, and the attorney's agreement when linked. The file sits in the
/// device's case-file cache (CaseFileCache): first tap saves, the next opens.
class DealRecordFiles extends ConsumerWidget {
  const DealRecordFiles({required this.record, super.key});

  final api.DealRecordDto record;

  Future<void> _print(
    BuildContext context,
    FileRef f,
    String closeLabel,
  ) async {
    // Web: the browser's own viewer prints. Phone: the system sheet (iOS and
    // Android list "Print" there); no native print library before release.
    if (kIsWeb) {
      await launchUrl(Uri.parse(f.url), mode: LaunchMode.externalApplication);
      return;
    }
    await CaseFileCache.open(context, f, closeLabel: closeLabel);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = record;
    final sealed = r.sealedFileId != null && r.sealedUrl != null;
    final fileId = sealed ? r.sealedFileId : r.unsignedFileId;
    final url = sealed ? r.sealedUrl : r.unsignedUrl;
    if (fileId == null || url == null) {
      return Text(
        t.t('deal.status.preparing'),
        style: type.bodySmall.copyWith(color: colors.textSecondary),
      );
    }
    final f = FileRef(fileId: fileId, mime: 'application/pdf', url: url);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            AppIcon(
              AppIcons.descriptionOutlined,
              size: 18,
              color: colors.textSecondary,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                '${t.t('deal.title')} · PDF',
                style: type.bodySmall,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            FileOpenButton.ref(file: f, key: ValueKey('deal-pdf-$fileId')),
            const SizedBox(width: AppSpacing.sm),
            AppRoundChipButton(
              label: t.t('deal.print'),
              icon: AppIcons.printOutlined,
              onTap: () => _print(context, f, t.t('common.close')),
            ),
          ],
        ),
        if (r.agreementFileId != null && r.agreementUrl != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              AppIcon(
                AppIcons.insertDriveFileRounded,
                size: 18,
                color: colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('deal.agreement'),
                  style: type.bodySmall,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              FileOpenButton.ref(
                file: FileRef(
                  fileId: r.agreementFileId!,
                  mime: 'application/pdf',
                  url: r.agreementUrl!,
                ),
                key: ValueKey('deal-agreement-${r.agreementFileId}'),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// The attorney links one of the case's PDF files as their own agreement.
class _AttachAgreement extends ConsumerStatefulWidget {
  const _AttachAgreement({required this.record});

  final api.DealRecordDto record;

  @override
  ConsumerState<_AttachAgreement> createState() => _AttachAgreementState();
}

class _AttachAgreementState extends ConsumerState<_AttachAgreement> {
  bool _busy = false;

  Future<void> _pick() async {
    final t = ref.read(translatorProvider);
    final files =
        await ref.read(caseFilesProvider(widget.record.caseId).future);
    final pdfs = files.where((f) => f.mime == 'application/pdf').toList();
    if (!mounted) return;
    final chosen = await showAppBottomSheet<api.WorkspaceFileDto>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Text(t.t('deal.agreement.pick')),
            ),
            for (final f in pdfs)
              ListTile(
                leading: const AppIcon(AppIcons.descriptionOutlined),
                title: Text(f.description ?? f.fileId.substring(0, 8)),
                onTap: () => Navigator.of(context).pop(f),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (chosen == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(dealRecordActionsProvider)
          .attachAgreement(widget.record.id, chosen.fileId);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return AppChip(
      label: t.t('deal.agreement'),
      leading: _busy
          ? const SizedBox.square(
              dimension: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const AppIcon(AppIcons.attachFileRounded, size: 16),
      onTap: _busy ? null : _pick,
    );
  }
}
