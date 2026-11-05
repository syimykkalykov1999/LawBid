import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';

void main() {
  late SocialLocalDatabase db;

  setUp(() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    db = SocialLocalDatabase(NativeDatabase.memory());
  });
  tearDown(() => db.close());

  Future<void> enqueue(String owner) => db.enqueue(
        clientMessageId: 'c-$owner',
        ownerId: owner,
        conversationId: 'chat-1',
        body: 'not sent yet',
      );

  test('unsent messages stay only for the one signing in, none on sign-out',
      () async {
    await enqueue('user-a');
    await enqueue('user-b');

    await db.forgetOutboxOfOthers(keeping: 'user-a');

    expect(await db.pending('user-a'), hasLength(1));
    expect(await db.pending('user-b'), isEmpty);

    await db.forgetOutboxOfOthers();
    expect(await db.pending('user-a'), isEmpty);
  });

  test('search history stays for the one signing in, all go on sign-out',
      () async {
    await db.remember('user-a', 'lawyers', 'divorce');
    await db.remember('user-b', 'lawyers', 'visa');

    await db.forgetRecentOfOthers(keeping: 'user-a');
    expect(await db.recent('user-a', 'lawyers'), hasLength(1));
    expect(await db.recent('user-b', 'lawyers'), isEmpty);

    await db.forgetRecentOfOthers();
    expect(await db.recent('user-a', 'lawyers'), isEmpty);
  });
}
