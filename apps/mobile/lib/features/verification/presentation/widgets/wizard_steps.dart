import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';
import 'package:lawbid/features/verification/presentation/widgets/capture_guide_overlay.dart';
import 'package:lawbid/features/verification/presentation/widgets/document_slot_card.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';

/// Callbacks the step bodies need from the wizard screen.
class StepActions {
  const StepActions({
    required this.addFile,
    required this.removeDocument,
    required this.retry,
    required this.cancel,
    required this.addLicense,
    required this.removeLicense,
    required this.selectIdType,
    required this.goTo,
  });

  final void Function(DocSlot slot, FileOrigin origin) addFile;
  final ValueChanged<VerificationDocument> removeDocument;
  final ValueChanged<UploadTask> retry;
  final ValueChanged<UploadTask> cancel;
  final VoidCallback addLicense;
  final ValueChanged<VerificationLicense> removeLicense;
  final ValueChanged<IdDocumentType> selectIdType;
  final ValueChanged<WizardStep> goTo;
}

/// Where a file comes from.
enum FileOrigin { cameraCard, cameraDocument, cameraSelfie, library, file }

/// Shared step layout: serif title, lead text, staggered content.
class StepBody extends StatelessWidget {
  const StepBody({
    required this.title,
    required this.lead,
    required this.children,
    super.key,
  });

  final String title;
  final String lead;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: staggeredEntrance([
          Semantics(
            header: true,
            child: Text(
              title,
              style: typography.titleLarge.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            lead,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          ...children,
        ]),
      ),
    );
  }
}

/// The docs/03 §8 mandatory privacy line before uploads.
class PrivacyNote extends StatelessWidget {
  const PrivacyNote({required this.t, super.key});

  final Translator t;

  @override
  Widget build(BuildContext context) => InlineNotice(
        tone: NoticeTone.info,
        icon: AppIcons.lockOutlineRounded,
        message: t.t('verification.privacy'),
      );
}

// --- 1. Intro ---------------------------------------------------------------

class IntroStep extends StatelessWidget {
  const IntroStep({required this.t, required this.identityRequired, super.key});

  final Translator t;
  final bool identityRequired;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final items = [
      (AppIcons.balanceRounded, 'verification.intro.item.license'),
      if (identityRequired) ...[
        (AppIcons.badgeOutlined, 'verification.intro.item.id'),
        (
          AppIcons.faceRetouchingNaturalOutlined,
          'verification.intro.item.selfie'
        ),
      ],
    ];
    return StepBody(
      title: t.t('verification.intro.title'),
      lead: t.t('verification.intro.lead'),
      children: [
        Center(
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.goldTint,
              border:
                  Border.all(color: colors.goldStroke.withValues(alpha: 0.4)),
            ),
            child: ScalesLogo(
              size: AppSizes.stateMedallion - AppSpacing.lg,
              semanticLabel: t.t('verification.title'),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        Text(
          t.t('verification.intro.needed'),
          style: typography.caption.copyWith(color: colors.goldDark),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppCard(
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                if (i > 0) Divider(height: AppSpacing.xl, color: colors.border),
                Row(
                  children: [
                    AppIconMedallion(icon: items[i].$1),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Text(
                        t.t(items[i].$2),
                        style: typography.body.copyWith(color: colors.text),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        PrivacyNote(t: t),
        const SizedBox(height: AppSpacing.lg),
        Text(
          t.t('verification.intro.disclaimer'),
          style: typography.legalFine.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

// --- 2. Licenses ------------------------------------------------------------

class LicensesStep extends StatelessWidget {
  const LicensesStep({
    required this.t,
    required this.state,
    required this.actions,
    super.key,
  });

  final Translator t;
  final WizardState state;
  final StepActions actions;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = state.request;
    final licenses = r.pendingLicenses;
    return StepBody(
      title: t.t('verification.licenses.title'),
      lead: t.t('verification.licenses.lead'),
      children: [
        if (licenses.isEmpty)
          AppCard(
            child: Column(
              children: [
                const AppIconMedallion(
                  icon: AppIcons.accountBalanceOutlined,
                  size: AppSizes.stateMedallion - AppSpacing.xl,
                  iconSize: AppSizes.iconLg,
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  t.t('verification.licenses.empty'),
                  textAlign: TextAlign.center,
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        for (final l in licenses) ...[
          _LicenseBlock(t: t, state: state, license: l, actions: actions),
          const SizedBox(height: AppSpacing.lg),
        ],
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: licenses.isEmpty
              ? t.t('verification.licenses.addFirst')
              : t.t('verification.licenses.addAnother'),
          icon: AppIcons.addRounded,
          variant: AppButtonVariant.secondary,
          onPressed: actions.addLicense,
        ),
        const SizedBox(height: AppSpacing.xl),
        PrivacyNote(t: t),
      ],
    );
  }
}

class _LicenseBlock extends StatelessWidget {
  const _LicenseBlock({
    required this.t,
    required this.state,
    required this.license,
    required this.actions,
  });

  final Translator t;
  final WizardState state;
  final VerificationLicense license;
  final StepActions actions;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final slot = DocSlot.barLicense(license.stateCode);
    final expires = license.expiresAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: colors.navy,
                borderRadius: BorderRadius.circular(AppRadii.proBadge),
              ),
              child: Text(
                license.stateCode,
                style: typography.badge.copyWith(color: colors.goldLight),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    license.stateName,
                    style: typography.roleTitle.copyWith(color: colors.text),
                  ),
                  Text(
                    [
                      t.t(
                        'verification.license.barShort',
                        {'number': license.barNumber},
                      ),
                      if (expires != null)
                        t.t('verification.license.expiresShort', {
                          'date': MaterialLocalizations.of(context)
                              .formatMediumDate(expires),
                        }),
                    ].join(' · '),
                    style: typography.bodySmall
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            if (state.request.isDraft)
              AppIconButton(
                semanticLabel: t.t(
                  'verification.license.remove',
                  {'state': license.stateName},
                ),
                onPressed: () => actions.removeLicense(license),
                icon: AppIcon(
                  AppIcons.deleteOutlineRounded,
                  color: colors.textSecondary,
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        DocumentSlotCard(
          t: t,
          title: t.t('verification.license.doc.title'),
          subtitle: t.t('verification.license.doc.subtitle'),
          icon: AppIcons.workspacePremiumOutlined,
          documents: state.request.docsFor(slot),
          tasks: state.tasksFor(slot),
          canAdd: state.canAddTo(slot),
          canRemoveAttached: state.request.isDraft,
          onRemoveAttached: actions.removeDocument,
          onRetry: actions.retry,
          onCancel: actions.cancel,
          actions: [
            SlotAction(
              label: t.t('verification.source.camera'),
              icon: AppIcons.photoCameraOutlined,
              onTap: () => actions.addFile(slot, FileOrigin.cameraCard),
            ),
            SlotAction(
              label: t.t('verification.source.file'),
              icon: AppIcons.uploadFileRounded,
              onTap: () => actions.addFile(slot, FileOrigin.file),
            ),
          ],
        ),
      ],
    );
  }
}

// --- 3. Identity document ---------------------------------------------------

class IdentityStep extends StatelessWidget {
  const IdentityStep({
    required this.t,
    required this.state,
    required this.actions,
    super.key,
  });

  final Translator t;
  final WizardState state;
  final StepActions actions;

  static String typeKey(IdDocumentType type) => switch (type) {
        IdDocumentType.driversLicense => 'verification.id.type.drivers_license',
        IdDocumentType.passport => 'verification.id.type.passport',
        IdDocumentType.stateId => 'verification.id.type.state_id',
      };

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final type = state.idType;
    final locked = state.request.identityType != null ||
        state.uploads.any((u) => IdDocumentType.ofKind(u.slot.kind) != null);
    final guide = type == IdDocumentType.passport
        ? FileOrigin.cameraDocument
        : FileOrigin.cameraCard;

    Widget side(DocSide side) {
      final slot = DocSlot.identity(type, side);
      return DocumentSlotCard(
        t: t,
        title: t.t(
          side == DocSide.front
              ? 'verification.id.front'
              : 'verification.id.back',
        ),
        subtitle: t.t(
          side == DocSide.front
              ? 'verification.id.front.hint'
              : 'verification.id.back.hint',
        ),
        icon: side == DocSide.front
            ? AppIcons.badgeOutlined
            : AppIcons.flipOutlined,
        documents: state.request.docsFor(slot),
        tasks: state.tasksFor(slot),
        canAdd: state.canAddTo(slot),
        canRemoveAttached: state.request.isDraft,
        onRemoveAttached: actions.removeDocument,
        onRetry: actions.retry,
        onCancel: actions.cancel,
        actions: [
          SlotAction(
            label: t.t('verification.source.camera'),
            icon: AppIcons.photoCameraOutlined,
            onTap: () => actions.addFile(slot, guide),
          ),
          SlotAction(
            label: t.t('verification.source.library'),
            icon: AppIcons.photoLibraryOutlined,
            onTap: () => actions.addFile(slot, FileOrigin.library),
          ),
        ],
      );
    }

    return StepBody(
      title: t.t('verification.id.title'),
      lead: t.t('verification.id.lead'),
      children: [
        Text(
          t.t('verification.id.type'),
          style: typography.caption.copyWith(color: colors.goldDark),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final option in IdDocumentType.values)
              Semantics(
                selected: option == type,
                child: AppChip(
                  label: t.t(typeKey(option)),
                  height: AppSizes.touchTarget,
                  selected: option == type,
                  onTap: locked && option != type
                      ? null
                      : () => actions.selectIdType(option),
                ),
              ),
          ],
        ),
        if (locked) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('verification.id.type.locked'),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        side(DocSide.front),
        if (type.needsBack) ...[
          const SizedBox(height: AppSpacing.lg),
          side(DocSide.back),
        ],
        const SizedBox(height: AppSpacing.xl),
        PrivacyNote(t: t),
      ],
    );
  }
}

// --- 4. Selfie --------------------------------------------------------------

class SelfieStep extends StatelessWidget {
  const SelfieStep({
    required this.t,
    required this.state,
    required this.actions,
    super.key,
  });

  final Translator t;
  final WizardState state;
  final StepActions actions;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    const slot = DocSlot.selfie();
    const illustration = AppSpacing.unit * 40; // 160
    return StepBody(
      title: t.t('verification.selfie.title'),
      lead: t.t('verification.selfie.lead'),
      children: [
        Center(
          child: Container(
            width: illustration,
            height: illustration,
            decoration: BoxDecoration(
              color: colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.sheet),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                AppIcon(
                  AppIcons.personRounded,
                  size: illustration * 0.5,
                  color: colors.goldStroke.withValues(alpha: 0.5),
                ),
                const Positioned.fill(
                  child: CaptureGuideOverlay(
                    guide: CaptureGuide.selfie,
                    scrim: false,
                    animate: false,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        for (final (icon, key) in [
          (AppIcons.faceOutlined, 'verification.selfie.tip.face'),
          (AppIcons.wbSunnyOutlined, 'verification.selfie.tip.light'),
          (AppIcons.visibilityOutlined, 'verification.selfie.tip.clear'),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: Row(
              children: [
                AppIcon(icon, size: AppSizes.iconSm, color: colors.goldDark),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    t.t(key),
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        DocumentSlotCard(
          t: t,
          title: t.t('verification.selfie.card'),
          subtitle: t.t('verification.selfie.cameraOnly'),
          icon: AppIcons.faceRetouchingNaturalOutlined,
          documents: state.request.docsFor(slot),
          tasks: state.tasksFor(slot),
          canAdd: state.canAddTo(slot),
          canRemoveAttached: state.request.isDraft,
          onRemoveAttached: actions.removeDocument,
          onRetry: actions.retry,
          onCancel: actions.cancel,
          actions: [
            SlotAction(
              label: t.t('verification.selfie.take'),
              icon: AppIcons.photoCameraFrontOutlined,
              onTap: () => actions.addFile(slot, FileOrigin.cameraSelfie),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        PrivacyNote(t: t),
      ],
    );
  }
}

// --- 5. Review & submit -----------------------------------------------------

class ReviewStep extends StatelessWidget {
  const ReviewStep({
    required this.t,
    required this.state,
    required this.actions,
    required this.comment,
    required this.onCommentChanged,
    required this.blockMessage,
    super.key,
  });

  final Translator t;
  final WizardState state;
  final StepActions actions;
  final TextEditingController comment;
  final ValueChanged<String> onCommentChanged;

  /// Why the last submit tap was refused (uploads, missing items).
  final String? blockMessage;

  @override
  Widget build(BuildContext context) {
    final r = state.request;
    final idType = state.idType;
    final missing = [...state.localMissing, ...state.missing];
    final message = r.infoRequestMessage;
    return StepBody(
      title: t.t(
        state.isSupplement
            ? 'verification.review.title.supplement'
            : 'verification.review.title',
      ),
      lead: t.t(
        state.isSupplement
            ? 'verification.review.lead.supplement'
            : 'verification.review.lead',
      ),
      children: [
        if (state.isSupplement && message != null) ...[
          InlineNotice(
            tone: NoticeTone.warning,
            icon: AppIcons.markEmailUnreadOutlined,
            title: t.t('verification.needsInfo.messageTitle'),
            message: message,
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        _SummaryRow(
          t: t,
          icon: AppIcons.balanceRounded,
          title: t.t('verification.review.licenses'),
          detail: r.pendingLicenses.isEmpty
              ? t.t('verification.review.none')
              : r.pendingLicenses.map((l) => l.stateName).join(', '),
          complete: r.licensesComplete || !r.isDraft,
          onEdit: () => actions.goTo(WizardStep.licenses),
        ),
        if (state.identityRequired) ...[
          const SizedBox(height: AppSpacing.md),
          _SummaryRow(
            t: t,
            icon: AppIcons.badgeOutlined,
            title: t.t('verification.review.id'),
            detail: t.t(IdentityStep.typeKey(r.identityType ?? idType)),
            complete: r.identityComplete,
            onEdit: () => actions.goTo(WizardStep.identity),
          ),
          const SizedBox(height: AppSpacing.md),
          _SummaryRow(
            t: t,
            icon: AppIcons.faceRetouchingNaturalOutlined,
            title: t.t('verification.review.selfie'),
            detail: t.t(
              r.selfieComplete
                  ? 'verification.review.selfie.done'
                  : 'verification.review.none',
            ),
            complete: r.selfieComplete,
            onEdit: () => actions.goTo(WizardStep.selfie),
          ),
        ],
        if (blockMessage != null || missing.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          InlineNotice(
            tone: NoticeTone.danger,
            icon: AppIcons.blockRounded,
            title: t.t('verification.review.blocked'),
            message: {
              if (blockMessage != null) blockMessage!,
              for (final m in missing) missingText(t, m, r),
            }.join('\n'),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        AppTextField(
          controller: comment,
          label: t.t('verification.review.comment'),
          hintText: t.t('verification.review.comment.hint'),
          helperText: t.t('verification.review.comment.helper'),
          maxLines: 4,
          maxLength: 500,
          textCapitalization: TextCapitalization.sentences,
          onChanged: onCommentChanged,
        ),
        const SizedBox(height: AppSpacing.lg),
        PrivacyNote(t: t),
      ],
    );
  }
}

/// Localized text of a missing item (docs/03 §2.1 completeness).
String missingText(Translator t, MissingItem m, VerificationRequest r) =>
    switch (m) {
      MissingLicense() => t.t('verification.missing.license'),
      MissingBarDocument(:final stateCode) =>
        t.t('verification.missing.barDoc', {
          'state': r.licenses
                  .where((l) => l.stateCode == stateCode)
                  .map((l) => l.stateName)
                  .firstOrNull ??
              stateCode,
        }),
      MissingIdentity(back: false) => t.t('verification.missing.id'),
      MissingIdentity(back: true) => t.t('verification.missing.idBack'),
      MissingSelfie() => t.t('verification.missing.selfie'),
      MissingCleanFile() => t.t('verification.missing.notClean'),
    };

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.t,
    required this.icon,
    required this.title,
    required this.detail,
    required this.complete,
    required this.onEdit,
  });

  final Translator t;
  final IconData icon;
  final String title;
  final String detail;
  final bool complete;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          AppIconMedallion(
            icon: complete ? AppIcons.checkRounded : icon,
            tone:
                complete ? AppMedallionTone.success : AppMedallionTone.neutral,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: typography.roleTitle.copyWith(color: colors.text),
                ),
                Text(
                  detail,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onEdit,
            style: TextButton.styleFrom(
              minimumSize: const Size(AppSizes.hitTarget, AppSizes.hitTarget),
            ),
            child: Text(
              t.t('verification.review.edit'),
              style: typography.bodySmall.copyWith(color: colors.goldDark),
            ),
          ),
        ],
      ),
    );
  }
}
