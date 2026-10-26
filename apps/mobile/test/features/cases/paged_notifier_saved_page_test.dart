import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-20 (speed): a list with a saved first page opens on it at
/// once; the live page replaces it in the background, and a failed refresh
/// keeps what is shown.
class _Notifier extends PagedNotifier<String> {
  _Notifier({required this.live, this.saved});

  final CursorPage<String>? saved;
  final Future<CursorPage<String>> Function() live;

  @override
  Future<CursorPage<String>?> cachedFirstPage() async => saved;

  @override
  Future<CursorPage<String>> fetch(String? cursor) => live();

  @override
  Object idOf(String item) => item;
}

void main() {
  late ProviderContainer container;

  AsyncNotifierProvider<_Notifier, PaginatedList<String>> make({
    required Future<CursorPage<String>> Function() live,
    CursorPage<String>? saved,
  }) {
    final provider = AsyncNotifierProvider<_Notifier, PaginatedList<String>>(
      () => _Notifier(saved: saved, live: live),
    );
    container = ProviderContainer();
    addTearDown(container.dispose);
    return provider;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('opens on the saved page without waiting for the network', () async {
    final live = Completer<CursorPage<String>>();
    final p = make(
      saved: const CursorPage(items: ['old']),
      live: () => live.future,
    );
    final first = await container.read(p.future);
    expect(first.items, ['old']);

    live.complete(const CursorPage(items: ['new', 'old'], nextCursor: 'c1'));
    await settle();
    await settle();
    final now = container.read(p).requireValue;
    expect(now.items, ['new', 'old']);
    expect(now.nextCursor, 'c1');
  });

  test('a failed background refresh keeps the saved page', () async {
    final p = make(
      saved: const CursorPage(items: ['old']),
      live: () async => throw StateError('offline'),
    );
    await container.read(p.future);
    await settle();
    await settle();
    expect(container.read(p).requireValue.items, ['old']);
  });

  test('without a saved page it loads as before', () async {
    final p = make(
      live: () async => const CursorPage(items: ['a'], nextCursor: 'n'),
    );
    final first = await container.read(p.future);
    expect(first.items, ['a']);
    expect(first.nextCursor, 'n');
  });

  test('a pull-to-refresh during the background read wins', () async {
    final gate = Completer<CursorPage<String>>();
    var calls = 0;
    final p = make(
      saved: const CursorPage(items: ['old']),
      live: () {
        calls++;
        return calls == 1
            ? gate.future
            : Future.value(const CursorPage(items: ['pulled']));
      },
    );
    await container.read(p.future);
    await settle();
    await container.read(p.notifier).refresh();
    expect(container.read(p).requireValue.items, ['pulled']);

    gate.complete(const CursorPage(items: ['late']));
    await settle();
    await settle();
    expect(container.read(p).requireValue.items, ['pulled']);
  });
}
