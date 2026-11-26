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

  test(
      'a last-resort KeyPackage serves several Welcomes, a one-time one only '
      'one (RFC 9420 §16.8)', () async {
    final alice = await device('ua', 'da');
    final bob = await device('ub', 'db');
    final last = await bob.newLastResortKeyPackage();
    final once = (await bob.newKeyPackages(1)).single;
    final g2 = Uint8List.fromList(utf8.encode('lawbid:conv-2'));
    final g3 = Uint8List.fromList(utf8.encode('lawbid:conv-3'));
    final g4 = Uint8List.fromList(utf8.encode('lawbid:conv-4'));
    Future<Uint8List> invite(Uint8List g, Uint8List kp) async {
      await alice.createGroup(g);
      final add = await alice.commit(g, keyPackages: [kp]);
      expect(add.epoch, 0);
      await alice.mergeCommit(g);
      return add.welcome!;
    }

    await bob.join(await invite(group, last));
    await bob.join(await invite(g2, last));
    final m = await alice.encrypt(g2, text('second group'));
    expect(read(await bob.decrypt(g2, m)), 'second group');
    await bob.join(await invite(g3, once));
    await expectLater(bob.join(await invite(g4, once)), throwsA(anything));
  });

  test('a message of the previous epoch opens after the commit (4 kept)',
      () async {
    final alice = await device('ua', 'da');
    final bob = await device('ub', 'db');
    final carl = await device('uc', 'dc');
    await alice.createGroup(group);
    final add =
        await alice.commit(group, keyPackages: await bob.newKeyPackages(1));
    await alice.mergeCommit(group);
    await bob.join(add.welcome!);
    final before = await alice.encrypt(group, text('sent in epoch 1'));
    final add2 =
        await alice.commit(group, keyPackages: await carl.newKeyPackages(1));
    await alice.mergeCommit(group);
    await bob.applyCommit(group, add2.commit);
    expect(await bob.epoch(group), 2);
    expect(read(await bob.decrypt(group, before)), 'sent in epoch 1');
  });

  test(
      'a reinstall (vault kept, database new) is a new device; the old id '
      'is handed over to be signed out', () async {
    final vault = MemoryMlsKeyVault();
    Future<OpenMlsEngine> open() =>
        OpenMlsEngine.open(userId: 'ua', vault: vault, dbPath: ':memory:');
    final first = await open();
    await first.setDeviceId('d-old');
    final again = await open();
    expect(again.deviceId, isNull);
    expect(again.previousDeviceId, 'd-old');
    expect(again.signaturePublicKey, isNot(first.signaturePublicKey));
    await again.forgetPreviousDevice();
    expect(await vault.read('mls.ua.previous'), isNull);
    // Wiped (sign-out): nothing of the device stays in the vault.
    await again.setDeviceId('d-new');
    await again.wipe();
    expect(vault.values.keys.where((k) => k.startsWith('mls.ua.')), isEmpty);
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
