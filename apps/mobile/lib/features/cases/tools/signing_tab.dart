import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/deals/deal_record_card.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid/features/cases/tools/signing_sheets.dart';
import 'package:lawbid/features/cases/tools/template_form_sheet.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Case tab "Docs": e-signature requests (both sides sign a PDF) and
/// documents built from templates.
class SigningTab extends ConsumerStatefulWidget {
  const SigningTab({required this.caseId, required this.isAttorney, super.key});

  final String caseId;
  final bool isAttorney;

  @override
  ConsumerState<SigningTab> createState() => _SigningTabState();
}

class _SigningTabState extends ConsumerState<SigningTab> {
  Future<void> _request() async {
    final t = ref.read(translatorProvider);
    final ok = await showRequestSheet(context, widget.caseId);
    if ((ok ?? false) && mounted) showAppSnackBar(context, t.t('sign.sent'));
  }

  Future<void> _sign(api.SignRequestDto r) async {
    final t = ref.read(translatorProvider);
    final ok = await showSignSheet(context, caseId: widget.caseId, request: r);
    if ((ok ?? false) && mounted) {
      showAppSnackBar(context, t.t('sign.signedOk'));
    }
  }

  Future<void> _decline(api.SignRequestDto r) async {
    final t = ref.read(translatorProvider);
    final ok =
        await showDeclineSheet(context, caseId: widget.caseId, request: r);
    if ((ok ?? false) && mounted) {
      showAppSnackBar(context, t.t('sign.declinedOk'));
    }
  }

  Future<void> _cancel(api.SignRequestDto r) async {
    final t = ref.read(translatorProvider);
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AppAlertDialog(
        title: Text(t.t('sign.cancelAsk')),
        content: Text(r.title),
        actions: [
          AppButton(
            label: t.t('sign.cancel'),
            variant: AppButtonVariant.danger,
            onPressed: () => Navigator.of(ctx).pop(true),
          ),
          AppButton(
            label: t.t('common.cancel'),
            variant: AppButtonVariant.secondary,
            onPressed: () => Navigator.of(ctx).pop(false),
          ),
        ],
      ),
    );
    if (!(yes ?? false) || !mounted) return;
    try {
      await ref.read(caseSigningActionsProvider).cancel(widget.caseId, r.id);
      if (mounted) showAppSnackBar(context, t.t('sign.canceledOk'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, signingErrorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(signRequestsProvider(widget.caseId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Deal record 2026-10-27: one card, on top of the Docs tab.
        DealRecordCard(caseId: widget.caseId, isAttorney: widget.isAttorney),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.xs,
          ),
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppChip(
                label: t.t('sign.request'),
                leading: const AppIcon(AppIcons.editNoteRounded, size: 16),
                onTap: _request,
              ),
              if (widget.isAttorney)
                AppChip(
                  label: t.t('docs.from'),
                  leading:
                      const AppIcon(AppIcons.descriptionOutlined, size: 16),
                  onTap: () => showTemplateSheet(context, widget.caseId),
                ),
            ],
          ),
        ),
        value.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: AppSkeleton(height: 120),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Text(signingErrorText(t, e)),
          ),
          data: (list) => list.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: _Empty(
                    title: t.t('sign.empty'),
                    hint: t.t('sign.emptyHint'),
                  ),
                )
              : Column(
                  children: [
                    for (final r in list)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.screenSide,
                          AppSpacing.sm,
                          AppSpacing.screenSide,
                          0,
                        ),
                        child: SignRequestCard(
                          request: r,
                          onSign: () => _sign(r),
                          onDecline: () => _decline(r),
                          onCancel: () => _cancel(r),
                          onVerify: () => showVerifySheet(
                            context,
                            caseId: widget.caseId,
                            request: r,
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.hint});

  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      children: [
        AppIcon(
          AppIcons.editNoteRounded,
          size: 36,
          color: colors.textSecondary,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          title,
          textAlign: TextAlign.center,
          style: type.body.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          hint,
          textAlign: TextAlign.center,
          style: type.bodySmall.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

/// One document: its status, who signed when, and what can be done.
class SignRequestCard extends ConsumerWidget {
  const SignRequestCard({
    required this.request,
    required this.onSign,
    required this.onDecline,
    required this.onCancel,
    required this.onVerify,
    super.key,
  });

  final api.SignRequestDto request;
  final VoidCallback onSign;
  final VoidCallback onDecline;
  final VoidCallback onCancel;
  final VoidCallback onVerify;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = request;
    final (icon, color, key) = switch (r.status) {
      api.SignRequestDtoStatus.signed => (
          AppIcons.checkCircleRounded,
          colors.successText,
          'sign.status.signed',
        ),
      api.SignRequestDtoStatus.declined => (
          AppIcons.cancelRounded,
          colors.dangerText,
          'sign.status.declined',
        ),
      api.SignRequestDtoStatus.canceled => (
          AppIcons.blockRounded,
          colors.textSecondary,
          'sign.status.canceled',
        ),
      _ => (
          AppIcons.hourglassTopRounded,
          colors.textSecondary,
          'sign.status.pending',
        ),
    };
    final by =
        t.t('sign.by', {'role': roleName(t, r.createdByRole.json ?? '')});
    final signedRoles = {for (final s in r.signatures) s.role.json};
    final waiting = [
      for (final role in const ['client', 'attorney'])
        if (!signedRoles.contains(role)) role,
    ];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppIcon(AppIcons.pictureAsPdfOutlined, size: 22),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  r.title,
                  style: type.body.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              AppIcon(icon, size: 16, color: color),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  t.t(key),
                  style: type.bodySmall.copyWith(
                    color: color,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '$by · ${formats.date(r.createdAt.toLocal())}',
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          for (final s in r.signatures)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                t.t('sign.signedBy', {
                  'name': s.name,
                  'role': roleName(t, s.role.json ?? ''),
                  'date': formats.dateTime(s.signedAt.toLocal()),
                }),
                style: type.bodySmall,
              ),
            ),
          if (r.status == api.SignRequestDtoStatus.pending)
            for (final role in waiting)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  t.t('sign.waitingFor', {'role': roleName(t, role)}),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
          if (r.status == api.SignRequestDtoStatus.declined) ...[
            if (r.declinedByRole != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  t.t('sign.declinedBy', {
                    'role': roleName(t, r.declinedByRole!.json ?? ''),
                  }),
                  style: type.bodySmall,
                ),
              ),
            if ((r.declineReason ?? '').trim().isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  t.t('sign.reasonLine', {'reason': r.declineReason!.trim()}),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
          ],
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (r.canSign)
                AppChip(
                  label: t.t('sign.sign'),
                  selected: true,
                  leading: const AppIcon(AppIcons.editNoteRounded, size: 16),
                  onTap: onSign,
                ),
              if (r.canDecline)
                AppChip(label: t.t('sign.decline'), onTap: onDecline),
              if (r.canCancel)
                AppChip(label: t.t('sign.cancel'), onTap: onCancel),
              if (r.status != api.SignRequestDtoStatus.canceled)
                AppChip(
                  label: t.t('sign.verify'),
                  leading:
                      const AppIcon(AppIcons.verifiedUserOutlined, size: 16),
                  onTap: onVerify,
                ),
              if (r.sourceUrl != null)
                _OpenLink(
                  label: t.t('sign.original'),
                  file: FileRef(
                    fileId: '${r.id}-source',
                    mime: 'application/pdf',
                    url: r.sourceUrl!,
                  ),
                ),
              if (r.finalUrl != null)
                _OpenLink(
                  label: t.t('sign.signedPdf'),
                  file: FileRef(
                    fileId: '${r.id}-final',
                    mime: 'application/pdf',
                    url: r.finalUrl!,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A PDF of the request: downloaded on the first tap, opened on the next.
class _OpenLink extends StatelessWidget {
  const _OpenLink({required this.label, required this.file});

  final String label;
  final FileRef file;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            label,
            style: type.caption.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: AppSpacing.xs),
        FileOpenButton.ref(file: file),
      ],
    );
  }
}
