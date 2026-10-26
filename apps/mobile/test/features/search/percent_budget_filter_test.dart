import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/search/data/search_repository.dart';

/// Owner 2026-10-18: «Проценты» in the cases budget filter.
void main() {
  test('percent counts as an active filter and changes equality', () {
    const none = SearchFilters();
    const pct = SearchFilters(budgetPercent: true);
    const capped = SearchFilters(budgetPercent: true, percentMax: 20);
    expect(none.activeCount, 0);
    expect(pct.activeCount, 1);
    expect(pct == none, isFalse);
    expect(capped == pct, isFalse);
    expect(capped.withBriefsOnly(value: false).percentMax, 20);
  });

  test('the feed extras compare and hash by the percent options', () {
    const a = CaseFeedExtras(budgetPercent: true, percentMax: 20);
    const b = CaseFeedExtras(budgetPercent: true, percentMax: 20);
    const c = CaseFeedExtras(budgetPercent: true);
    expect(a, b);
    expect(a.hashCode, b.hashCode);
    expect(a == c, isFalse);
  });
}
