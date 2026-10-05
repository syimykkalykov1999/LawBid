import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_dossier.dart';

FeedCase _case({
  String? city,
  int? budgetCents,
  CaseUrgency? urgency,
  CaseDossier dossier = CaseDossier.empty,
}) =>
    FeedCase(
      id: 'c-1',
      title: 'Unpaid wages',
      practice: const PracticeRef(
        id: 'p',
        code: 'employment.wages',
        i18nKey: 'practice.employment.wages',
        nameEn: 'Wages',
      ),
      primaryStateCode: 'IL',
      additionalStateCodes: const [],
      city: city,
      status: CaseStatus.open,
      budget: CaseBudget(
        mode: budgetCents == null ? BudgetMode.clarifyLater : BudgetMode.amount,
        amountCents: budgetCents,
      ),
      viewCount: 0,
      bidsCount: 0,
      createdAt: DateTime(2026, 10, 5),
      isNew: false,
      hasOwnBid: false,
      urgency: urgency,
      dossier: dossier,
    );

void main() {
  const ru = StaticTranslatorRu();
  const en = StaticTranslatorEn();

  test('an empty case scores 0 of 6, little detail, no files', () {
    final s = CaseDossierScore.of(_case());
    expect(s.done, 0);
    expect(s.total, 6);
    expect(s.levelKey, 'cases.dossier.level.thin');
    expect(s.files(en), 'No files');
    expect(s.score(ru), '0 из 6');
  });

  test('every field and both kinds of files count', () {
    final s = CaseDossierScore.of(
      _case(
        city: 'Chicago',
        budgetCents: 200000,
        urgency: CaseUrgency.soon,
        dossier: const CaseDossier(
          imagesCount: 2,
          documentsCount: 3,
          descriptionLength: kDossierDetailedDescription,
        ),
      ),
    );
    expect(s.done, 6);
    expect(s.levelKey, 'cases.dossier.level.full');
    expect(s.files(ru), '3 документа · 2 фото');
    expect(s.files(en), '3 documents · 2 photos');
  });

  test('a short description, a blank city and documents only', () {
    final s = CaseDossierScore.of(
      _case(
        city: '  ',
        urgency: CaseUrgency.urgent,
        dossier: const CaseDossier(documentsCount: 1, descriptionLength: 80),
      ),
    );
    expect(s.done, 2);
    expect(s.files(ru), '1 документ');
  });
}
