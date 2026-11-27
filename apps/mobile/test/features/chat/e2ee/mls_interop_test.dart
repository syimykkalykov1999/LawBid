import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine_io.dart';
import 'package:lawbid/features/chat/e2ee/mls_key_vault.dart';

/// Item 25: a phone (OpenMLS) and a browser (ts-mls, the bundle the web app
/// loads) are members of one group: the phone adds the browser, each reads
/// the other's message. Skipped where `node` is not installed.
void main() {
  final node = Process.runSync('which', ['node']).exitCode == 0;

  test(
    'OpenMLS and ts-mls interoperate (add, welcome, both directions)',
    () async {
      final peer = await Process.start('node', [
        'test/features/chat/e2ee/interop/ts_mls_peer.mjs',
      ]);
      // A failed expect must not leave node running (flutter test would
      // never exit).
      addTearDown(peer.kill);
      final lines = peer.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .asBroadcastStream();
      Future<Map<String, dynamic>> ask(Map<String, Object> cmd) async {
        peer.stdin.writeln(jsonEncode(cmd));
        final answer = jsonDecode(
          await lines.first.timeout(const Duration(seconds: 30)),
        ) as Map<String, dynamic>;
        expect(answer['error'], isNull);
        return answer;
      }

      final phone = await OpenMlsEngine.open(
        userId: 'ua',
        vault: MemoryMlsKeyVault(),
        dbPath: ':memory:',
      );
      await phone.setDeviceId('phone');
      final group = Uint8List.fromList(utf8.encode('lawbid:interop'));
      await phone.createGroup(group);

      final kp = await ask({'op': 'keyPackage', 'identity': 'ub:web'});
      final add = await phone.commit(
        group,
        keyPackages: [base64Decode(kp['keyPackage'] as String)],
      );
      await phone.mergeCommit(group);
      final joined = await ask({
        'op': 'join',
        'welcome': base64Encode(add.welcome!),
      });
      expect(joined['epoch'], 1);

      final toWeb = await phone.encrypt(
        group,
        Uint8List.fromList(utf8.encode('С телефона')),
      );
      final got = await ask({'op': 'process', 'message': base64Encode(toWeb)});
      expect(got['text'], 'С телефона');

      final fromWeb = await ask({'op': 'encrypt', 'text': 'Из браузера'});
      final back = await phone.decrypt(
        group,
        base64Decode(fromWeb['message'] as String),
      );
      expect(utf8.decode(back!), 'Из браузера');

      // RFC 9420 §16.8: the phone's last-resort KeyPackage (OpenMLS's
      // last_resort extension) is accepted by ts-mls — the browser and the
      // Delivery Service decode it the same way — and the phone joins.
      final last = await phone.newLastResortKeyPackage();
      final started = await ask({
        'op': 'groupWith',
        'keyPackage': base64Encode(last),
        'identity': 'ub:web',
      });
      final g2 = await phone.join(base64Decode(started['welcome'] as String));
      final hi = await ask({'op': 'encrypt', 'text': 'Последний ключ'});
      final lastGot =
          await phone.decrypt(g2, base64Decode(hi['message'] as String));
      expect(utf8.decode(lastGot!), 'Последний ключ');
      peer.kill();
    },
    skip: node ? false : 'node is not installed',
    timeout: const Timeout(Duration(minutes: 2)),
  );

  test(
    'G2 groups: external joins across OpenMLS and ts-mls, both ways '
    '(ts-mls 1.6.4 with LukaJCB/ts-mls#449 backported)',
    () async {
      final peer = await Process.start('node', [
        'test/features/chat/e2ee/interop/ts_mls_peer.mjs',
      ]);
      // A failed expect must not leave node running (KNOWN_ERRORS 269).
      addTearDown(peer.kill);
      final lines = peer.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .asBroadcastStream();
      Future<Map<String, dynamic>> ask(Map<String, Object> cmd) async {
        peer.stdin.writeln(jsonEncode(cmd));
        final answer = jsonDecode(
          await lines.first.timeout(const Duration(seconds: 30)),
        ) as Map<String, dynamic>;
        expect(answer['error'], isNull);
        return answer;
      }

      Future<OpenMlsEngine> phone(String user, String id) async {
        final e = await OpenMlsEngine.open(
          userId: user,
          vault: MemoryMlsKeyVault(),
          dbPath: ':memory:',
        );
        await e.setDeviceId(id);
        return e;
      }

      final alice = await phone('ua', 'phone');
      final g = Uint8List.fromList(utf8.encode('lawbid:g:interop'));
      await alice.createGroup(g);
      final upd = await alice.commit(g, groupInfo: true);
      await alice.mergeCommit(g);

      // The browser joins from the phone's GroupInfo.
      final joined = await ask({
        'op': 'externalJoin',
        'groupInfo': base64Encode(upd.groupInfo!),
        'identity': 'ub:web',
      });
      expect(joined['epoch'], 2);
      await alice.applyCommit(g, base64Decode(joined['commit'] as String));
      final hi = await ask({'op': 'encrypt', 'text': 'вошёл по ссылке'});
      expect(
        utf8.decode(
          (await alice.decrypt(g, base64Decode(hi['message'] as String)))!,
        ),
        'вошёл по ссылке',
      );

      // A new phone joins from the browser's GroupInfo.
      final carl = await phone('uc', 'phone2');
      final info = await ask({'op': 'groupInfo'});
      final j = await carl.joinExternal(
        base64Decode(info['groupInfo'] as String),
      );
      await carl.mergeCommit(g);
      await alice.applyCommit(g, j.commit);
      final seen = await ask({
        'op': 'process',
        'message': base64Encode(j.commit),
      });
      expect(seen['epoch'], 3);
      final fromWeb = await ask({'op': 'encrypt', 'text': 'всем'});
      final msg = base64Decode(fromWeb['message'] as String);
      expect(utf8.decode((await carl.decrypt(g, msg))!), 'всем');
      expect(utf8.decode((await alice.decrypt(g, msg))!), 'всем');
    },
    skip: node ? false : 'node is not installed',
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
