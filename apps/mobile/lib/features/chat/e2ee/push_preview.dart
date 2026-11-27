import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as h;
import 'package:cryptography/cryptography.dart';

import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';

/// M12 (owner 26.11 «в уведомлениях будет текст, как в WhatsApp»): the
/// text of an end-to-end encrypted message in its push, which the server
/// never reads.
///
/// Each phone makes its own push-preview key pair (X25519) on the device:
/// the private half stays in the iPhone's Keychain (shared with the
/// notification extension) / Android Keystore-wrapped storage, the public
/// half goes to the server next to the push token. The SENDER's app seals
/// a short preview to every recipient device with HPKE (RFC 9180, base
/// mode) and the server only forwards the sealed bytes inside the push;
/// the iPhone's Notification Service Extension (CryptoKit HPKE, iOS 17+)
/// and the Android push receiver (Google Tink HPKE) open it. Anything that
/// fails there shows «Новое сообщение», as before.
///
/// The suite is the one both CryptoKit (`Curve25519_SHA256_ChachaPoly`) and
/// Tink (`DHKEM_X25519_HKDF_SHA256` / `HKDF_SHA256` / `CHACHA20_POLY1305`)
/// support: KEM 0x0020, KDF 0x0001, AEAD 0x0003. The output is Tink's
/// HPKE `NO_PREFIX` format: `enc (32) || ciphertext || tag (16)`, empty
/// associated data (Tink's hybrid encryption has none), and the chat's id
/// in the HPKE `info`, so a preview cannot be moved to another chat.
///
/// Written from RFC 9180 §4–§5 (there is no maintained Dart HPKE package;
/// own code approved by the owner for this item); checked against the
/// RFC's own test vector A.2.1 (test/features/chat/e2ee/push_preview_test.dart).
abstract final class PushPreview {
  /// HPKE `info`: this label, a zero byte, the conversation id.
  static const infoLabel = 'lawbid push preview v1';

  /// The longest preview text (WhatsApp cuts the banner too).
  static const maxChars = 120;

  /// The most phones one message seals to (the server's MAX_PUSH_PREVIEWS).
  static const maxKeys = 32;

  static Uint8List info(String conversationId) => Uint8List.fromList([
        ...utf8.encode(infoLabel),
        0,
        ...utf8.encode(conversationId),
      ]);

  /// What the banner says, before sealing (the phone formats it in its own
  /// language with the words the server sends): `{"v":1,"k":kind,"t":text}`
  /// plus `ms` for a voice note. Kinds: text, photo, video, voice, file.
  /// Null when there is nothing to show (the banner stays «Новое
  /// сообщение»).
  static Uint8List? plaintextOf(E2eePayload p) {
    final kind = _kindOf(p);
    final text = _cut(p.body.trim());
    if (kind == 'text' && text.isEmpty) return null;
    final ms = p.extra['ms'];
    return Uint8List.fromList(
      utf8.encode(
        jsonEncode({
          'v': 1,
          'k': kind,
          if (text.isNotEmpty) 't': text,
          if (kind == 'voice' && ms is int && ms > 0) 'ms': ms,
        }),
      ),
    );
  }

  static String _kindOf(E2eePayload p) {
    if (p.kind != 'file') return 'text';
    final m = p.extra['mime'];
    final mime = m is String ? m : '';
    if (mime.startsWith('image/')) return 'photo';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/') && p.extra['wave'] != null) return 'voice';
    return 'file';
  }

  /// The first [maxChars] characters (whole code points, never half an
  /// emoji's surrogate pair).
  static String _cut(String s) {
    final runes = s.runes;
    if (runes.length <= maxChars) return s;
    return String.fromCharCodes(runes.take(maxChars));
  }

  /// Seals [plaintext] to the device key [recipientPublicKey] (32 bytes).
  /// [ephemeral] is for the RFC test vector only.
  static Future<Uint8List> seal({
    required List<int> recipientPublicKey,
    required List<int> info,
    required List<int> plaintext,
    List<int> aad = const [],
    SimpleKeyPair? ephemeral,
  }) async {
    if (recipientPublicKey.length != 32) {
      throw ArgumentError('An X25519 public key is 32 bytes.');
    }
    final x = X25519();
    final skE = ephemeral ?? await x.newKeyPair();
    final enc = (await skE.extractPublicKey()).bytes;
    final dh = await (await x.sharedSecretKey(
      keyPair: skE,
      remotePublicKey:
          SimplePublicKey(recipientPublicKey, type: KeyPairType.x25519),
    ))
        .extractBytes();
    final ctx = Hpke.keySchedule(
      sharedSecret: Hpke.sharedSecret(dh, enc, recipientPublicKey),
      info: info,
    );
    final box = await Chacha20.poly1305Aead().encrypt(
      plaintext,
      secretKey: SecretKey(ctx.key),
      nonce: ctx.baseNonce,
      aad: aad,
    );
    return Uint8List.fromList([...enc, ...box.cipherText, ...box.mac.bytes]);
  }
}

/// The RFC 9180 key schedule pieces for DHKEM(X25519, HKDF-SHA256),
/// HKDF-SHA256, ChaCha20Poly1305, base mode (exposed for the test vector).
abstract final class Hpke {
  static const _version = 'HPKE-v1';
  static final _kemSuite = [..._ascii('KEM'), 0x00, 0x20];
  static final _hpkeSuite = [
    ..._ascii('HPKE'),
    0x00, 0x20, // DHKEM(X25519, HKDF-SHA256)
    0x00, 0x01, // HKDF-SHA256
    0x00, 0x03, // ChaCha20Poly1305
  ];

  static List<int> _ascii(String s) => ascii.encode(s);

  static List<int> _extract(List<int> salt, List<int> ikm) =>
      h.Hmac(h.sha256, salt).convert(ikm).bytes;

  static List<int> _expand(List<int> prk, List<int> info, int length) {
    final out = <int>[];
    var t = <int>[];
    for (var i = 1; out.length < length; i++) {
      t = h.Hmac(h.sha256, prk).convert([...t, ...info, i]).bytes;
      out.addAll(t);
    }
    return out.sublist(0, length);
  }

  static List<int> _labeledExtract(
    List<int> suite,
    List<int> salt,
    String label,
    List<int> ikm,
  ) =>
      _extract(salt, [..._ascii(_version), ...suite, ..._ascii(label), ...ikm]);

  static List<int> _labeledExpand(
    List<int> suite,
    List<int> prk,
    String label,
    List<int> info,
    int length,
  ) =>
      _expand(
        prk,
        [
          (length >> 8) & 0xff,
          length & 0xff,
          ..._ascii(_version),
          ...suite,
          ..._ascii(label),
          ...info,
        ],
        length,
      );

  /// RFC 9180 §4.1 ExtractAndExpand(dh, enc || pkR).
  static List<int> sharedSecret(
    List<int> dh,
    List<int> enc,
    List<int> pkR,
  ) {
    final prk = _labeledExtract(_kemSuite, const [], 'eae_prk', dh);
    return _labeledExpand(
      _kemSuite,
      prk,
      'shared_secret',
      [...enc, ...pkR],
      32,
    );
  }

  /// RFC 9180 §5.1 KeySchedule, mode_base (no PSK).
  static ({List<int> key, List<int> baseNonce}) keySchedule({
    required List<int> sharedSecret,
    required List<int> info,
  }) {
    final pskIdHash =
        _labeledExtract(_hpkeSuite, const [], 'psk_id_hash', const []);
    final infoHash = _labeledExtract(_hpkeSuite, const [], 'info_hash', info);
    final context = [0x00, ...pskIdHash, ...infoHash];
    final secret =
        _labeledExtract(_hpkeSuite, sharedSecret, 'secret', const []);
    return (
      key: _labeledExpand(_hpkeSuite, secret, 'key', context, 32),
      baseNonce: _labeledExpand(_hpkeSuite, secret, 'base_nonce', context, 12),
    );
  }
}
