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
      final lines = peer.stdout
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .asBroadcastStream();
      Future<Map<String, dynamic>> ask(Map<String, Object> cmd) async {
        peer.stdin.writeln(jsonEncode(cmd));
        final answer = jsonDecode(await lines.first) as Map<String, dynamic>;
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
      peer.kill();
    },
    skip: node ? false : 'node is not installed',
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
