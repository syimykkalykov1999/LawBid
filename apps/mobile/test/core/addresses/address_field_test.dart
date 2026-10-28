import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/addresses/address_field.dart';
import 'package:lawbid/core/addresses/address_suggestions.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-28: every address field suggests US addresses while the
/// person types (debounce ≥ 250 ms, 3+ letters, one session per address).
class FakeAddressRepo extends AddressSuggestionsRepository {
  FakeAddressRepo({this.enabled = true}) : super(Dio());

  bool enabled;
  final calls = <({String q, AddressKind kind, String? session})>[];

  @override
  Future<AddressSuggestions> suggest(
    String query, {
    AddressKind kind = AddressKind.address,
    String? session,
  }) async {
    calls.add((q: query, kind: kind, session: session));
    if (!enabled) return (enabled: false, items: const <AddressSuggestion>[]);
    return (
      enabled: true,
      items: kind == AddressKind.city
          ? const [
              AddressSuggestion(
                label: 'Hays, KS',
                city: 'Hays',
                stateCode: 'KS',
              ),
            ]
          : [
              AddressSuggestion(
                label: '$query St, Hays, KS 67601',
                city: 'Hays',
                stateCode: 'KS',
              ),
              const AddressSuggestion(label: '12 Main St, Ellis, KS 67637'),
            ],
    );
  }
}

Future<({TextEditingController c, List<AddressSuggestion> picked})> _pump(
  WidgetTester tester,
  FakeAddressRepo repo, {
  AddressKind kind = AddressKind.address,
}) async {
  final c = TextEditingController();
  addTearDown(c.dispose);
  final picked = <AddressSuggestion>[];
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        addressSuggestionsRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: AddressField(
              key: const ValueKey('addr'),
              controller: c,
              kind: kind,
              onSelected: picked.add,
            ),
          ),
        ),
      ),
    ),
  );
  return (c: c, picked: picked);
}

void main() {
  testWidgets('waits for 3 letters and a pause, then shows suggestions',
      (tester) async {
    final repo = FakeAddressRepo();
    await _pump(tester, repo);
    await tester.enterText(find.byKey(const ValueKey('addr')), '12');
    await tester.pump(const Duration(seconds: 1));
    expect(repo.calls, isEmpty);

    await tester.enterText(find.byKey(const ValueKey('addr')), '12 M');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byKey(const ValueKey('addr')), '12 Ma');
    await tester.pump(const Duration(milliseconds: 100));
    expect(repo.calls, isEmpty, reason: 'still typing: no call yet');
    await tester.pump(kAddressDebounce);
    expect(repo.calls.map((c) => c.q), ['12 Ma'], reason: 'one call');
    expect(kAddressDebounce.inMilliseconds, greaterThanOrEqualTo(250));
    expect(repo.calls.single.session, isNotNull);
    await tester.pump();
    expect(find.byKey(const ValueKey('address-suggestions')), findsOneWidget);
    expect(find.text('12 Ma St, Hays, KS 67601'), findsOneWidget);
  });

  testWidgets('a tap fills the field, hides the list and starts a new session',
      (tester) async {
    final repo = FakeAddressRepo();
    final r = await _pump(tester, repo);
    await tester.enterText(find.byKey(const ValueKey('addr')), '12 Main');
    await tester.pump(kAddressDebounce);
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('address-suggestion-1')));
    await tester.pump();
    expect(r.c.text, '12 Main St, Ellis, KS 67637');
    expect(r.picked.single.label, '12 Main St, Ellis, KS 67637');
    expect(find.byKey(const ValueKey('address-suggestions')), findsNothing);

    await tester.enterText(find.byKey(const ValueKey('addr')), '40 Oak');
    await tester.pump(kAddressDebounce);
    expect(repo.calls, hasLength(2));
    expect(repo.calls[1].session, isNot(repo.calls[0].session));
  });

  testWidgets('a city field asks for cities and keeps only the city name',
      (tester) async {
    final repo = FakeAddressRepo();
    final r = await _pump(tester, repo, kind: AddressKind.city);
    await tester.enterText(find.byKey(const ValueKey('addr')), 'Hay');
    await tester.pump(kAddressDebounce);
    await tester.pump();
    expect(repo.calls.single.kind, AddressKind.city);
    await tester.tap(find.text('Hays, KS'));
    await tester.pump();
    expect(r.c.text, 'Hays');
  });

  testWidgets('suggestions off on the server: a plain field, no more calls',
      (tester) async {
    final repo = FakeAddressRepo(enabled: false);
    final r = await _pump(tester, repo);
    await tester.enterText(find.byKey(const ValueKey('addr')), '12 Main');
    await tester.pump(kAddressDebounce);
    await tester.pump();
    expect(find.byKey(const ValueKey('address-suggestions')), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('addr')), '12 Main St');
    await tester.pump(kAddressDebounce);
    expect(repo.calls, hasLength(1));
    expect(r.c.text, '12 Main St', reason: 'typing still works');
  });

  test('the repository never asks the server below 3 letters', () async {
    final repo = AddressSuggestionsRepository(Dio());
    final res = await repo.suggest('  a ');
    expect(res.enabled, isTrue);
    expect(res.items, isEmpty);
  });

  test('session ids are url-safe and random', () {
    final a = newAddressSession();
    expect(a, matches(RegExp(r'^[A-Za-z0-9]{24}$')));
    expect(newAddressSession(), isNot(a));
  });
}
