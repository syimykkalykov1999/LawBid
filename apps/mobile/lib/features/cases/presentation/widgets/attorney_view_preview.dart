import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';

/// Owner 2026-10-19: «Как ваш кейс видят адвокаты» on the client's own case
/// until a bid is accepted — the very card of the attorneys' feed, built
/// only from what every verified attorney gets (no name, photo, contacts,
/// files or private details; only their counts), and not tappable.
class AttorneyViewPreview extends StatelessWidget {
  const AttorneyViewPreview({
    required this.item,
    required this.t,
    required this.formats,
    super.key,
  });

  /// The case as an attorney's feed gets it ([feedViewOf] / [feedViewOfDraft]).
  final FeedCase item;
  final Translator t;
  final L10nFormats formats;

  /// What an attorney's feed gets for this case.
  static FeedCase feedViewOf(OwnerCase c) {
    final images = c.photos.where((p) => !_isDocument(p.mime)).length;
    return FeedCase(
      id: c.id,
      title: c.title,
      // The feed card colours by the category code, which the owner's case
      // may lack: the same fallback as the case head (owner 2026-10-19).
      practice: PracticeRef(
        id: c.practice.id,
        code: c.practice.code,
        i18nKey: c.practice.i18nKey,
        nameEn: c.practice.nameEn,
        categoryI18nKey: c.practice.categoryI18nKey,
        categoryNameEn: c.practice.categoryNameEn,
        categoryCode: c.practice.artCode,
      ),
      primaryStateCode: c.primaryStateCode,
      additionalStateCodes: c.additionalStateCodes,
      city: c.city,
      status: c.status,
      budget: c.budget,
      viewCount: c.viewCount,
      bidsCount: c.bidsCount,
      createdAt: c.createdAt,
      isNew: false,
      hasOwnBid: false,
      description: c.description,
      photosCount: images,
      extraPracticeCount: c.extraPractices.length,
      coverKey: c.coverKey,
      urgency: c.urgency,
      urgencyDetail: c.urgencyDetail,
      dossier: CaseDossier(
        imagesCount: images,
        documentsCount: c.photos.length - images,
        descriptionLength: c.description.length,
        privateDetailsLength: c.privateDetails?.length ?? 0,
      ),
    );
  }

  /// Owner 2026-10-19: the same, for a case not published yet (the last
  /// step of the case wizard).
  static FeedCase feedViewOfDraft(
    CaseDraft d,
    List<CasePhotoUpload> files,
  ) {
    final media = files.where((f) => !f.isDocument).length;
    final code = d.practiceCode ?? '';
    final percent = d.budgetIsPercent && d.budgetPercentBps != null;
    final amount = !percent && d.budgetIsAmount && d.budgetDollars != null;
    final urgency = d.urgency == null ? null : CaseUrgency.fromJson(d.urgency!);
    return FeedCase(
      id: 'draft',
      title: d.title.trim(),
      practice: PracticeRef(
        id: d.practiceAreaId ?? '',
        code: code,
        i18nKey: d.practiceI18nKey ?? '',
        nameEn: d.practiceNameEn ?? '',
        categoryCode: code.isEmpty ? null : code.split('.').first,
      ),
      primaryStateCode: d.primaryStateCode ?? '',
      additionalStateCodes: d.additionalStateCodes,
      city: d.city.trim().isEmpty ? null : d.city.trim(),
      status: CaseStatus.open,
      budget: CaseBudget(
        mode: percent
            ? BudgetMode.percent
            : amount
                ? BudgetMode.amount
                : BudgetMode.clarifyLater,
        amountCents: amount ? d.budgetDollars! * 100 : null,
        percentBps: percent ? d.budgetPercentBps : null,
      ),
      viewCount: 0,
      bidsCount: 0,
      createdAt: DateTime.now(),
      isNew: true,
      hasOwnBid: false,
      description: d.description.trim(),
      photosCount: media,
      extraPracticeCount: d.extraPractices.length,
      coverKey: d.coverKey,
      urgency: urgency,
      urgencyDetail: CaseUrgencyInfo.of(
        urgency: urgency,
        deadlineAt: parseIsoDay(d.deadlineAt),
        kind: d.deadlineKind == null
            ? null
            : CaseDeadlineKind.fromJson(d.deadlineKind!),
      ),
      dossier: CaseDossier(
        imagesCount: media,
        documentsCount: files.length - media,
        descriptionLength: d.description.trim().length,
        privateDetailsLength: d.privateDetails.trim().length,
      ),
    );
  }

  static bool _isDocument(String mime) =>
      !mime.startsWith('image/') && !mime.startsWith('video/');

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('cases.preview.note'),
          style: type.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        // The same widget attorneys see; taps do nothing here.
        IgnorePointer(
          child: ExcludeSemantics(
            child: FeedCaseCard(
              item: item,
              t: t,
              formats: formats,
              onTap: () {},
            ),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            key: const ValueKey('case-preview-more'),
            onPressed: () => context.push(AppRoutes.guide),
            child: Text(
              t.t('cases.preview.more'),
              style: type.bodySmall.copyWith(color: colors.goldDark),
            ),
          ),
        ),
      ],
    );
  }
}

/// Owner 2026-10-19: the preview opens from the «Как выглядит ваш кейс»
/// button as a sheet (not inline in «Обзор»).
Future<void> showAttorneyViewPreview(
  BuildContext context, {
  required FeedCase item,
  required Translator t,
  required L10nFormats formats,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) {
        final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
        final colors = Theme.of(sheet).extension<AppColorTokens>()!;
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              0,
              AppSpacing.screenSide,
              AppSpacing.lg,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                Text(
                  t.t('cases.preview.title'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.sm),
                AttorneyViewPreview(item: item, t: t, formats: formats),
              ],
            ),
          ),
        );
      },
    );
