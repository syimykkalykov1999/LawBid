import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// A description at least this long counts as "detailed" (owner
/// 2026-10-05: a few sentences an attorney can work from).
const kDossierDetailedDescription = 200;

/// Which rule line goes under the dossier: the attorney bids on the case
/// (the files open once the client accepts the bid), the client sent the
/// case to the attorney as an offer (they open once it is accepted), or
/// the client looks at their own case (who sees what, and a nudge).
enum CaseDossierRule { bid, offer, owner }

/// One line of the dossier checklist.
class CaseDossierItem {
  const CaseDossierItem(this.labelKey, {required this.done});

  final String labelKey;
  final bool done;
}

/// Owner 2026-10-05: how complete a case is, from what every attorney may
/// see before bidding — filled-in fields and the number of attached files
/// (never the files themselves, OQ-031).
class CaseDossierScore {
  CaseDossierScore._(this.items, this.dossier);

  /// The one rule (mirrored by apps/api cases/domain/case-dossier.ts).
  factory CaseDossierScore.fromFields({
    required CaseDossier dossier,
    required String? city,
    required CaseUrgency? urgency,
    required CaseBudget budget,
  }) =>
      CaseDossierScore._(
        [
          CaseDossierItem(
            'cases.dossier.item.description',
            done: dossier.descriptionLength >= kDossierDetailedDescription,
          ),
          CaseDossierItem(
            'cases.dossier.item.city',
            done: city != null && city.trim().isNotEmpty,
          ),
          CaseDossierItem('cases.dossier.item.urgency', done: urgency != null),
          CaseDossierItem(
            'cases.dossier.item.budget',
            done: !budget.isClarifyLater,
          ),
          CaseDossierItem(
            'cases.dossier.item.documents',
            done: dossier.documentsCount > 0,
          ),
          CaseDossierItem(
            'cases.dossier.item.photos',
            done: dossier.imagesCount > 0,
          ),
        ],
        dossier,
      );

  factory CaseDossierScore.of(FeedCase c) => CaseDossierScore.fromFields(
        dossier: c.dossier,
        city: c.city,
        urgency: c.urgency,
        budget: c.budget,
      );

  /// The client's own case: the files are counted from its photo list.
  factory CaseDossierScore.ofOwner(OwnerCase c) {
    final images = c.photos.where((p) => p.mime.startsWith('image/')).length;
    return CaseDossierScore.fromFields(
      dossier: CaseDossier(
        imagesCount: images,
        documentsCount: c.photos.length - images,
        descriptionLength: c.description.length,
      ),
      city: c.city,
      urgency: c.urgency,
      budget: c.budget,
    );
  }

  final List<CaseDossierItem> items;
  final CaseDossier dossier;

  int get done => items.where((i) => i.done).length;
  int get total => items.length;

  /// full ≥ 5, basic 3–4, thin ≤ 2.
  String get levelKey => done >= 5
      ? 'cases.dossier.level.full'
      : done >= 3
          ? 'cases.dossier.level.basic'
          : 'cases.dossier.level.thin';

  /// "3 documents · 2 photos" / "No files".
  String files(Translator t) {
    final parts = [
      if (dossier.documentsCount > 0)
        t.plural('cases.dossier.docs', dossier.documentsCount),
      if (dossier.imagesCount > 0)
        t.plural('cases.dossier.photos', dossier.imagesCount),
    ];
    return parts.isEmpty ? t.t('cases.dossier.noFiles') : parts.join(' · ');
  }

  String score(Translator t) =>
      t.t('cases.dossier.score', {'n': '$done', 'total': '$total'});
}

Color _levelColor(AppColorTokens colors, bool light, int done) => done >= 5
    ? colors.success
    : done >= 3
        ? (light ? colors.goldDark : colors.gold)
        : colors.textSecondary;

/// The segmented bar: one segment per checklist item, filled ones first.
class _DossierBar extends StatelessWidget {
  const _DossierBar({
    required this.done,
    required this.total,
    required this.color,
    this.height = 4,
  });

  final int done;
  final int total;
  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Row(
      children: [
        for (var i = 0; i < total; i++) ...[
          if (i > 0) const SizedBox(width: 3),
          Expanded(
            child: Container(
              height: height,
              decoration: BoxDecoration(
                color: i < done ? color : colors.border,
                borderRadius: BorderRadius.circular(height),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Owner 2026-10-05: the dossier line on a feed card — "Case file 4 of 6",
/// a bar, what is attached, and the rule that the files and contacts open
/// once the client accepts the bid. Texts ellipsize, never push.
class CaseDossierStrip extends StatelessWidget {
  const CaseDossierStrip({required this.kase, required this.t, super.key});

  final FeedCase kase;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final light = Theme.of(context).brightness == Brightness.light;
    final s = CaseDossierScore.of(kase);
    final tone = _levelColor(colors, light, s.done);
    final caption = typography.caption.copyWith(color: colors.textSecondary);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            AppIcon(AppIcons.folderOutlined, size: 16, color: tone),
            const SizedBox(width: AppSpacing.xs + 2),
            Flexible(
              child: Text(
                '${t.t('cases.dossier.title')} ${s.score(t)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: typography.caption.copyWith(
                  color: tone,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            SizedBox(
              width: 54,
              child: _DossierBar(done: s.done, total: s.total, color: tone),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                s.files(t),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: caption.copyWith(color: colors.text),
              ),
            ),
          ],
        ),
        if (kase.status == CaseStatus.open) ...[
          const SizedBox(height: AppSpacing.xs),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(
                AppIcons.lockOutlineRounded,
                size: 13,
                color: colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.xs + 2),
              Expanded(
                child: Text(
                  t.t('cases.dossier.ruleShort'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: caption.copyWith(fontSize: 11),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Owner 2026-10-05: the dossier on the case page (and on a client's offer
/// with their case): the score, a checklist of what the client filled in
/// and attached, and the rule. [unlocked] = the files are already open to
/// this attorney (their bid was accepted).
class CaseDossierPanel extends StatelessWidget {
  const CaseDossierPanel({
    required this.score,
    required this.status,
    required this.t,
    this.rule = CaseDossierRule.bid,
    this.unlocked = false,
    this.action,
    super.key,
  });

  final CaseDossierScore score;
  final CaseStatus status;
  final Translator t;
  final CaseDossierRule rule;
  final bool unlocked;

  /// Owner view: "Add documents and photos" under the checklist.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final light = Theme.of(context).brightness == Brightness.light;
    final s = score;
    final tone = _levelColor(colors, light, s.done);
    final caption = typography.caption.copyWith(color: colors.textSecondary);
    final showRule = unlocked || status == CaseStatus.open;
    return Semantics(
      container: true,
      label: [
        t.t('cases.dossier.title'),
        s.score(t),
        t.t(s.levelKey),
        s.files(t),
      ].join(', '),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.gold.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                AppIcon(AppIcons.folderOutlined, size: 20, color: tone),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    '${t.t('cases.dossier.title')} · ${t.t(s.levelKey)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 96),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      s.score(t),
                      maxLines: 1,
                      style: typography.body.copyWith(
                        color: tone,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            _DossierBar(
              done: s.done,
              total: s.total,
              color: tone,
              height: 6,
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.xs + 2,
              children: [
                for (final item in s.items)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AppIcon(
                        item.done
                            ? AppIcons.checkCircleRounded
                            : AppIcons.radioButtonUncheckedRounded,
                        size: 16,
                        color: item.done ? colors.success : colors.border,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Text(
                        t.t(item.labelKey),
                        style: caption.copyWith(
                          color: item.done ? colors.text : colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                AppIcon(
                  AppIcons.attachFileRounded,
                  size: 16,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    s.files(t),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: caption.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
            if (showRule) ...[
              const SizedBox(height: AppSpacing.sm),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIcon(
                    unlocked
                        ? AppIcons.lockOpenRounded
                        : AppIcons.lockOutlineRounded,
                    size: 16,
                    color: unlocked ? colors.success : colors.goldDark,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      t.t(
                        unlocked
                            ? 'cases.dossier.unlocked'
                            : switch (rule) {
                                CaseDossierRule.offer =>
                                  'cases.dossier.ruleOffer',
                                CaseDossierRule.owner =>
                                  'cases.dossier.ruleOwner',
                                CaseDossierRule.bid => 'cases.dossier.ruleBid',
                              },
                      ),
                      style: caption,
                    ),
                  ),
                ],
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: AppSpacing.md),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
