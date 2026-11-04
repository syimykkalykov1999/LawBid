import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_eviction.dart';

/// Owner 2026-11-03: the policy behind «Максимальный размер кэша» (least
/// recently used first, across stores) and «Автоудаление» (by last open).
void main() {
  final now = DateTime(2026, 11, 3);
  EvictionEntry e(String pool, int daysAgo, int bytes) => EvictionEntry(
        pool: pool,
        lastUsed: now.subtract(Duration(days: daysAgo)),
        bytes: bytes,
      );

  test('under the cap or no cap: nothing goes', () {
    final all = [e('a', 9, 400), e('b', 1, 500)];
    expect(planCapEviction(all, 900), isEmpty);
    expect(planCapEviction(all, 1000), isEmpty);
    expect(planCapEviction(all, null), isEmpty);
  });

  test('over the cap: oldest first until what is left fits', () {
    final all = [e('a', 1, 400), e('b', 9, 400), e('c', 5, 400)];
    final victims = planCapEviction(all, 800);
    expect([for (final v in victims) v.pool], ['b']);
    final more = planCapEviction(all, 400);
    expect([for (final v in more) v.pool], ['b', 'c']);
  });

  test('a cap of zero takes everything, oldest first', () {
    final victims = planCapEviction([e('a', 1, 10), e('b', 2, 10)], 0);
    expect([for (final v in victims) v.pool], ['b', 'a']);
  });

  test('equal times are broken by the pool name, so runs agree', () {
    final victims = planCapEviction([e('z', 3, 10), e('a', 3, 10)], 10);
    expect(victims.single.pool, 'a');
  });

  test('age: only what was not opened since the cutoff, oldest first', () {
    final cutoff = now.subtract(const Duration(days: 7));
    final victims = planAgeEviction(
      [e('a', 3, 1), e('b', 30, 1), e('c', 8, 1), e('d', 7, 1)],
      cutoff,
    );
    expect([for (final v in victims) v.pool], ['b', 'c']);
  });
}
