import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/push_preview.dart';

Uint8List _hex(String s) {
  final c = s.replaceAll(RegExp(r'\s'), '');
  return Uint8List.fromList([
    for (var i = 0; i < c.length; i += 2)
      int.parse(c.substring(i, i + 2), radix: 16),
  ]);
}

String _toHex(List<int> b) =>
    b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

/// HPKE base-mode open (RFC 9180 §5.2), the receiver's side, for the test
/// only (the phones open with CryptoKit / Tink).
Future<List<int>> _open(
  List<int> sealed,
  SimpleKeyPair recipient,
  List<int> info, {
  List<int> aad = const [],
}) async {
  final enc = sealed.sublist(0, 32);
  final pkR = (await recipient.extractPublicKey()).bytes;
  final dh = await (await X25519().sharedSecretKey(
    keyPair: recipient,
    remotePublicKey: SimplePublicKey(enc, type: KeyPairType.x25519),
  ))
      .extractBytes();
  final ctx = Hpke.keySchedule(
    sharedSecret: Hpke.sharedSecret(dh, enc, pkR),
    info: info,
  );
  final body = sealed.sublist(32);
  return Chacha20.poly1305Aead().decrypt(
    SecretBox(
      body.sublist(0, body.length - 16),
      nonce: ctx.baseNonce,
      mac: Mac(body.sublist(body.length - 16)),
    ),
    secretKey: SecretKey(ctx.key),
    aad: aad,
  );
}

void main() {
  group('RFC 9180 A.2.1 (DHKEM X25519, HKDF-SHA256, ChaCha20Poly1305)', () {
    final info = _hex('4f6465206f6e2061204772656369616e2055726e');
    final skEm = _hex(
      'f4ec9b33b792c372c1d2c2063507b684'
      'ef925b8c75a42dbcbf57d63ccd381600',
    );
    final pkEm = _hex(
      '1afa08d3dec047a643885163f1180476'
      'fa7ddb54c6a8029ea33f95796bf2ac4a',
    );
    final pkRm = _hex(
      '4310ee97d88cc1f088a5576c77ab0cf5'
      'c3ac797f3d95139c6c84b5429c59662a',
    );
    final skRm = _hex(
      '8057991eef8f1f1af18f4a9491d16a1c'
      'e333f695d4db8e38da75975c4478e0fb',
    );
    final pt = _hex(
      '4265617574792069732074727574682c20747275746820626561757479',
    );

    test('shared secret, key and base nonce', () async {
      final dh = await (await X25519().sharedSecretKey(
        keyPair: await X25519().newKeyPairFromSeed(skEm),
        remotePublicKey: SimplePublicKey(pkRm, type: KeyPairType.x25519),
      ))
          .extractBytes();
      final ss = Hpke.sharedSecret(dh, pkEm, pkRm);
      expect(
        _toHex(ss),
        '0bbe78490412b4bbea4812666f7916932b828bba79942424abb65244930d69a7',
      );
      final ctx = Hpke.keySchedule(sharedSecret: ss, info: info);
      expect(
        _toHex(ctx.key),
        'ad2744de8e17f4ebba575b3f5f5a8fa1f69c2a07f6e7500bc60ca6e3e3ec1c91',
      );
      expect(_toHex(ctx.baseNonce), '5c4d98150661b848853b547f');
    });

    test('seal = enc || ciphertext of sequence 0', () async {
      final sealed = await PushPreview.seal(
        recipientPublicKey: pkRm,
        info: info,
        plaintext: pt,
        aad: _hex('436f756e742d30'),
        ephemeral: await X25519().newKeyPairFromSeed(skEm),
      );
      expect(
        _toHex(sealed),
        '${_toHex(pkEm)}'
        '1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db'
        '21993c62ce81883d2dd1b51a28',
      );
      final opened = await _open(
        sealed,
        await X25519().newKeyPairFromSeed(skRm),
        info,
        aad: _hex('436f756e742d30'),
      );
      expect(opened, pt);
    });
  });

  group('push preview', () {
    test('a random key opens; another chat id does not', () async {
      final device = await X25519().newKeyPair();
      final pk = (await device.extractPublicKey()).bytes;
      final plain = PushPreview.plaintextOf(
        const E2eePayload(kind: 'text', body: 'Привет 👋'),
      )!;
      final sealed = await PushPreview.seal(
        recipientPublicKey: pk,
        info: PushPreview.info('conv-1'),
        plaintext: plain,
      );
      expect(sealed.length, 32 + plain.length + 16);
      final opened = await _open(sealed, device, PushPreview.info('conv-1'));
      expect(jsonDecode(utf8.decode(opened)), {
        'v': 1,
        'k': 'text',
        't': 'Привет 👋',
      });
      await expectLater(
        _open(sealed, device, PushPreview.info('conv-2')),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
    });

    test('info is the label, a zero byte and the chat id', () {
      expect(
        utf8.decode(PushPreview.info('abc')),
        'lawbid push preview v1\u0000abc',
      );
    });

    test('kinds, the 120-character cut and an empty text', () {
      Map<String, dynamic> of(E2eePayload p) =>
          jsonDecode(utf8.decode(PushPreview.plaintextOf(p)!))
              as Map<String, dynamic>;
      expect(PushPreview.plaintextOf(const E2eePayload(kind: 'text')), isNull);
      expect(
        of(
          const E2eePayload(
            kind: 'file',
            body: 'море',
            extra: {'mime': 'image/jpeg'},
          ),
        ),
        {'v': 1, 'k': 'photo', 't': 'море'},
      );
      expect(
        of(const E2eePayload(kind: 'file', extra: {'mime': 'video/mp4'})),
        {'v': 1, 'k': 'video'},
      );
      expect(
        of(
          const E2eePayload(
            kind: 'file',
            extra: {'mime': 'audio/mp4', 'wave': 'AAAA', 'ms': 12000},
          ),
        ),
        {'v': 1, 'k': 'voice', 'ms': 12000},
      );
      expect(
        of(
          const E2eePayload(
            kind: 'file',
            extra: {'mime': 'application/pdf', 'name': 'secret.pdf'},
          ),
        ),
        // A file's name stays private (as the server's pushes, OQ-047).
        {'v': 1, 'k': 'file'},
      );
      final long = '😀' * 200;
      final t = of(E2eePayload(kind: 'text', body: long))['t'] as String;
      expect(t.runes.length, PushPreview.maxChars);
    });
  });
}
