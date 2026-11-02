import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../features/cases/cases_fakes.dart';

/// Long user data for the overflow tests (owner 2026-11-02): names, titles,
/// places and amounts as wide as real people write them.
const longTitle = 'Disputed commercial lease and security deposit return for '
    'a restaurant premises in downtown Springfield';
const longText = 'The landlord kept the entire security deposit after the '
    'lease ended and refuses to give an itemised statement of deductions. '
    'Several emails and certified letters went unanswered since March and '
    'the premises were left in better condition than we received them.';
const longPlace = 'Springfield-on-the-Very-Long-River-Township';

/// A client's open case with every text field long and a huge budget.
OwnerCase longOwnerCase() => OwnerCase(
      id: 'c1',
      title: longTitle,
      description: longText,
      practice: const PracticeRef(
        id: 'leaf-1',
        code: 'landlord_tenant',
        i18nKey: 'practice.traffic',
        nameEn: 'Commercial Landlord and Tenant Disputes',
        categoryNameEn: 'Real Estate and Property',
      ),
      primaryStateCode: 'NJ',
      additionalStateCodes: const ['NY', 'PA', 'CT'],
      city: longPlace,
      budget: const CaseBudget(
        mode: BudgetMode.amount,
        amountCents: 99999999999,
      ),
      status: CaseStatus.open,
      viewCount: 1234567,
      bidsCount: 9999,
      createdAt: DateTime(2026, 9, 2),
      lastActivityAt: DateTime(2026, 11),
      privateDetails: longText,
    );

/// A cases repository whose `ownerCase` is [longOwnerCase].
class LongCasesRepository extends FakeCasesRepository {
  @override
  Future<OwnerCase> ownerCase(String caseId) async => longOwnerCase();
}

/// [LongCasesRepository] whose feed is two [longFeedCase]s.
class LongFeedCasesRepository extends LongCasesRepository {
  @override
  Future<CursorPage<FeedCase>> feed({
    String? cursor,
    String? practiceAreaId,
    String? practiceCategory,
    String? state,
    CaseFeedExtras extras = const CaseFeedExtras(),
    bool mineOnly = true,
    List<String> states = const [],
  }) async =>
      CursorPage(items: [longFeedCase('f1'), longFeedCase('f2')]);
}

/// An open case in the attorney's feed with every text field long.
FeedCase longFeedCase(String id) => FeedCase(
      id: id,
      title: longTitle,
      practice: const PracticeRef(
        id: 'leaf-1',
        code: 'landlord_tenant',
        i18nKey: 'practice.traffic',
        nameEn: 'Commercial Landlord and Tenant Disputes',
        categoryNameEn: 'Real Estate and Property',
      ),
      primaryStateCode: 'NJ',
      additionalStateCodes: const ['NY', 'PA', 'CT'],
      city: longPlace,
      status: CaseStatus.open,
      budget: const CaseBudget(
        mode: BudgetMode.amount,
        amountCents: 99999999999,
      ),
      viewCount: 1234567,
      bidsCount: 9999,
      createdAt: DateTime(2026, 10, 4),
      isNew: true,
      hasOwnBid: true,
      description: longText,
    );
