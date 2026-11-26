import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/push_preview_hpke.dart';

Uint8List _hex(String s) {
  final clean = s.replaceAll(RegExp(r'\s'), '');
  return Uint8List.fromList([
    for (var i = 0; i < clean.length; i += 2)
      int.parse(clean.substring(i, i + 2), radix: 16),
  ]);
}

/// Third pass M12: the push-preview HPKE (RFC 9180) against the RFC's own
/// test vectors, Appendix A.2.1 — DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
/// ChaCha20Poly1305, base mode, sequence number 0. CryptoKit and Tink use
/// the same suite, so a match here is what lets the phones open it.
void main() {
  final info = _hex('4f6465206f6e2061204772656369616e2055726e');
  final ikmE =
      _hex('909a9b35d3dc4713a5e72a4da274b55d3d3821a37e5d099e74a647db583a904b');
  final ikmR =
      _hex('1ac01f181fdf9f352797655161c58b75c656a6cc2716dcb66372da835542e1df');
  final skRm =
      _hex('8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb');
  final pkRm =
      _hex('4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a');
  final enc =
      _hex('1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a');
  final pt = _hex('4265617574792069732074727574682c20747275746820626561757479');

  test('DeriveKeyPair matches the RFC', () async {
    expect(PushPreviewHpke.deriveSecretKey(ikmR), skRm);
    expect(await PushPreviewHpke.publicKeyOf(skRm), pkRm);
  });

  test('seal with the RFC ephemeral gives the RFC enc and ciphertext',
      () async {
    final aad = _hex('436f756e742d30'); // "Count-0", sequence number 0
    final sealed = await PushPreviewHpke.seal(
      pkRm,
      pt,
      infoBytes: info,
      aad: aad,
      ephemeralIkm: ikmE,
    );
    expect(sealed.sublist(0, 32), enc);
    expect(
      sealed.sublist(32),
      _hex('1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db'
          '21993c62ce81883d2dd1b51a28'),
    );
    expect(
      await PushPreviewHpke.open(skRm, sealed, infoBytes: info, aad: aad),
      pt,
    );
  });

  test('a real preview opens only with its own key', () async {
    final sk = PushPreviewHpke.deriveSecretKey(List.filled(32, 1));
    final pk = await PushPreviewHpke.publicKeyOf(sk);
    final other = PushPreviewHpke.deriveSecretKey(List.filled(32, 2));
    final sealed = await PushPreviewHpke.seal(pk, utf8.encode('Привет 👋'));
    expect(utf8.decode((await PushPreviewHpke.open(sk, sealed))!), 'Привет 👋');
    expect(await PushPreviewHpke.open(other, sealed), isNull);
    final tampered = Uint8List.fromList(sealed)..[40] ^= 1;
    expect(await PushPreviewHpke.open(sk, tampered), isNull);
    expect(await PushPreviewHpke.open(sk, [1, 2, 3]), isNull);
  });
}
