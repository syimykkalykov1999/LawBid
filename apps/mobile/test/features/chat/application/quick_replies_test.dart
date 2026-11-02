import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/application/quick_replies_providers.dart';
import 'package:lawbid/features/chat/data/quick_replies_repository.dart';

/// Owner 2026-11-02: the attorney's quick replies are changed in place; a
/// refused delete puts the row back.
class _FakeRepo extends QuickRepliesRepository {
  _FakeRepo({this.failDelete = false}) : super(Dio());

  final bool failDelete;
  final rows = <QuickReply>[
    const QuickReply(id: '1', title: 'Hello', body: 'Hi, how can I help?'),
    const QuickReply(id: '2', title: 'Fee', body: 'My fee is fixed.'),
  ];

  @override
  Future<List<QuickReply>> list() async => [...rows];

  @override
  Future<QuickReply> create(String title, String body) async =>
      QuickReply(id: '3', title: title, body: body);

  @override
  Future<QuickReply> update(String id, String title, String body) async =>
      QuickReply(id: id, title: title, body: body);

  @override
  Future<void> delete(String id) async {
    if (failDelete) throw StateError('offline');
  }
}

ProviderContainer _container(_FakeRepo repo) => ProviderContainer(
      overrides: [quickRepliesRepositoryProvider.overrideWithValue(repo)],
    );

void main() {
  test('matches the name or the text, case-insensitive; empty matches all', () {
    const r = QuickReply(id: '1', title: 'Fee', body: 'My fee is fixed.');
    expect(r.matches(''), isTrue);
    expect(r.matches('  FEE '), isTrue);
    expect(r.matches('fixed'), isTrue);
    expect(r.matches('hello'), isFalse);
  });

  test('add goes last, edit keeps the place, remove drops the row', () async {
    final c = _container(_FakeRepo());
    addTearDown(c.dispose);
    await c.read(quickRepliesProvider.future);
    final n = c.read(quickRepliesProvider.notifier);
    await n.add('New', 'text');
    final ids = c.read(quickRepliesProvider).value!.map((r) => r.id);
    expect(ids, ['1', '2', '3']);
    await n.edit('1', 'Hi', 'Hello!');
    expect(c.read(quickRepliesProvider).value!.first.title, 'Hi');
    await n.remove('2');
    expect(c.read(quickRepliesProvider).value!.map((r) => r.id), ['1', '3']);
  });

  test('a refused delete puts the row back and rethrows', () async {
    final c = _container(_FakeRepo(failDelete: true));
    addTearDown(c.dispose);
    await c.read(quickRepliesProvider.future);
    await expectLater(
      c.read(quickRepliesProvider.notifier).remove('1'),
      throwsStateError,
    );
    expect(c.read(quickRepliesProvider).value!.map((r) => r.id), ['1', '2']);
  });
}
