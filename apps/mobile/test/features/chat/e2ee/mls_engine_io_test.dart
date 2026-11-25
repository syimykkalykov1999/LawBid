import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine_io.dart';
import 'package:lawbid/features/chat/e2ee/mls_key_vault.dart';

/// Item 25: the device MLS client (OpenMLS via `openmls`) — encryption round
/// trip, two devices of one person, adding and removing a member moves the
/// epoch and a removed device reads no more.
void main() {
  Future<OpenMlsEngine> device(String user, String id) async {
    final e = await OpenMlsEngine.open(
      userId: user,
      vault: MemoryMlsKeyVault(),
      dbPath: ':memory:',
    );
    await e.setDeviceId(id);
    return e;
  }

  final group = Uint8List.fromList(utf8.encode('lawbid:conv-1'));
  Uint8List text(String s) => Uint8List.fromList(utf8.encode(s));
  String read(Uint8List? b) => utf8.decode(b!);

  test('round trip, multi-device, add and remove move the epoch', () async {
    final alice = await device('ua', 'da');
    final bob = await device('ub', 'db1');
    final bobWeb = await device('ub', 'db2');

    // KeyPackages travel as MLSMessage (what the Delivery Service checks).
    final bobKp = (await bob.newKeyPackages(1)).single;
    expect(bobKp.sublist(0, 4), [0, 1, 0, 5]);

    await alice.createGroup(group);
    expect(await alice.epoch(group), 0);
    final add = await alice.commit(group, keyPackages: [bobKp]);
    await alice.mergeCommit(group);
    expect(await alice.epoch(group), 1);
    expect(_same(await bob.join(add.welcome!), group), isTrue);

    final hello = await alice.encrypt(group, text('Привет, Боб'));
    expect(utf8.decode(hello, allowMalformed: true), isNot(contains('Боб')));
    expect(read(await bob.decrypt(group, hello)), 'Привет, Боб');

    // Bob's second device joins (any member may add it).
    final webKp = (await bobWeb.newKeyPackages(1)).single;
    final add2 = await bob.commit(group, keyPackages: [webKp]);
    await bob.mergeCommit(group);
    await alice.applyCommit(group, add2.commit);
    await bobWeb.join(add2.welcome!);
    expect(await alice.epoch(group), 2);
    final fromWeb = await bobWeb.encrypt(group, text('from the browser'));
    expect(read(await alice.decrypt(group, fromWeb)), 'from the browser');
    expect(read(await bob.decrypt(group, fromWeb)), 'from the browser');
    expect(
      (await alice.members(group)).map((m) => m.identity).toSet(),
      {'ua:da', 'ub:db1', 'ub:db2'},
    );

    // The browser is signed out: removed, it cannot read what follows.
    final rm = await alice.commit(group, removeDeviceIds: ['db2']);
    await alice.mergeCommit(group);
    await bob.applyCommit(group, rm.commit);
    expect(await alice.epoch(group), 3);
    final after = await alice.encrypt(group, text('after the removal'));
    expect(read(await bob.decrypt(group, after)), 'after the removal');
    await expectLater(bobWeb.decrypt(group, after), throwsA(anything));
  });

  test('a discarded commit leaves the group where it was', () async {
    final alice = await device('ua', 'da');
    final bob = await device('ub', 'db');
    await alice.createGroup(group);
    await alice.commit(group, keyPackages: await bob.newKeyPackages(1));
    await alice.discardCommit(group);
    expect(await alice.epoch(group), 0);
  });
}

bool _same(Uint8List a, Uint8List b) =>
    a.length == b.length &&
    List.generate(a.length, (i) => a[i] == b[i]).every((x) => x);
