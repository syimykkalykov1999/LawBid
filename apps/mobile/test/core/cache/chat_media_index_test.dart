import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/chat_media_index.dart';

void main() {
  late CacheDatabase db;
  late Map<String, int> disk;
  late ChatMediaIndex index;

  setUp(() {
    db = CacheDatabase(NativeDatabase.memory());
    disk = {};
    index = ChatMediaIndex(
      db,
      sizeOf: (k) async => disk[k],
      remove: (k) async => disk.remove(k),
    );
  });
  tearDown(() => db.close());

  test('sizes are summed per chat, biggest chat first', () async {
    disk.addAll({'/a': 100, '/b': 50, '/c': 400});
    await index.note('chat-1', ['/a', '/b']);
    await index.note('chat-2', ['/c']);
    final usage = await index.usage();
    expect(usage.map((u) => u.conversationId), ['chat-2', 'chat-1']);
    expect(usage.first.bytes, 400);
    expect(usage.last.bytes, 150);
    expect(usage.last.files, 2);
  });

  test('a picture shown in two chats counts for the newest only', () async {
    disk['/a'] = 10;
    await index.note('chat-1', ['/a']);
    await index.note('chat-2', ['/a']);
    final usage = await index.usage();
    expect(usage.single.conversationId, 'chat-2');
  });

  test('files gone from the cache leave the index', () async {
    disk['/a'] = 10;
    await index.note('chat-1', ['/a', '/gone']);
    expect((await index.usage()).single.files, 1);
    expect(await db.chatMediaRows(), hasLength(1));
  });

  test('clear removes the chat files and nothing else', () async {
    disk.addAll({'/a': 100, '/b': 50, '/c': 400});
    await index.note('chat-1', ['/a', '/b']);
    await index.note('chat-2', ['/c']);
    expect(await index.clear(['chat-1']), 150);
    expect(disk.keys, ['/c']);
    expect((await index.usage()).single.conversationId, 'chat-2');
  });

  test('forgetAll empties the index', () async {
    disk['/a'] = 10;
    await index.note('chat-1', ['/a']);
    await index.forgetAll();
    expect(await index.usage(), isEmpty);
  });

  test('noting nothing is a no-op', () async {
    await index.note('chat-1', const []);
    expect(await db.chatMediaRows(), isEmpty);
  });
}
