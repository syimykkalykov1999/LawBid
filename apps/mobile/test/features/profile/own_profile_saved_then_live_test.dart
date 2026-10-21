import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';

/// Owner 2026-10-20 (speed, Telegram): my profile opens on the saved copy,
/// then the live one; the copy is not shown again after the first live
/// answer of the session (an edit + invalidate must not flash old data).
void main() {
  test('saved copy first, then the live profile', () async {
    final seen = await savedThenLive<String>(
      owner: 't1',
      saved: () async => 'old',
      live: () async => 'new',
    ).toList();
    expect(seen, ['old', 'new']);
  });

  test('after a live answer the copy is not shown again', () async {
    Future<List<String>> run() => savedThenLive<String>(
          owner: 't2',
          saved: () async => 'old',
          live: () async => 'new',
        ).toList();
    expect(await run(), ['old', 'new']);
    expect(await run(), ['new']);
  });

  test('a failed live read behind a shown copy keeps the copy', () async {
    final seen = await savedThenLive<String>(
      owner: 't3',
      saved: () async => 'old',
      live: () async => throw StateError('offline'),
    ).toList();
    expect(seen, ['old']);
  });

  test('a failed live read without a copy is an error, as before', () async {
    expect(
      savedThenLive<String>(
        owner: 't4',
        saved: () async => null,
        live: () async => throw StateError('offline'),
      ).toList(),
      throwsStateError,
    );
  });

  test('signed out: no copy is read', () async {
    final seen = await savedThenLive<String>(
      owner: null,
      saved: () async => fail('must not read'),
      live: () async => 'new',
    ).toList();
    expect(seen, ['new']);
  });
}
