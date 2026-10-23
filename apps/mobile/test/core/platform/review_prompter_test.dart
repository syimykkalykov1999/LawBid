import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:in_app_review_platform_interface/in_app_review_platform_interface.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/platform/review_prompter.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-22 (checklist §27): the store review dialog is asked for
/// after a positive moment — behind the `in_app_review` flag and at most
/// once in 90 days on a device.
class _FakeReviewPlatform extends InAppReviewPlatform {
  int requests = 0;
  bool available = true;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<void> requestReview() async => requests++;

  @override
  Future<void> openStoreListing({
    String? appStoreId,
    String? microsoftStoreId,
  }) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _FakeReviewPlatform platform;
  late LocalKvStore store;
  var now = DateTime(2026, 10, 22, 12);
  var flag = true;

  ReviewPrompter prompter() => ReviewPrompter(
        store: store,
        now: () => now,
        enabled: () => flag,
        review: InAppReview.instance,
      );

  setUp(() async {
    platform = _FakeReviewPlatform();
    InAppReviewPlatform.instance = platform;
    SharedPreferences.setMockInitialValues({});
    store = LocalKvStore(await SharedPreferences.getInstance());
    now = DateTime(2026, 10, 22, 12);
    flag = true;
  });

  test('asks once, then not again for 90 days', () async {
    final p = prompter();
    expect(await p.maybeAsk(), isTrue);
    expect(platform.requests, 1);
    expect(p.lastAsked, now);

    now = now.add(const Duration(days: 89));
    expect(await p.maybeAsk(), isFalse);
    expect(platform.requests, 1);

    now = now.add(const Duration(days: 1));
    expect(await p.maybeAsk(), isTrue);
    expect(platform.requests, 2);
  });

  test('nothing without the flag or without the store', () async {
    flag = false;
    expect(await prompter().maybeAsk(), isFalse);
    flag = true;
    platform.available = false;
    expect(await prompter().maybeAsk(), isFalse);
    expect(platform.requests, 0);
    expect(prompter().lastAsked, isNull);
  });
}
