import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §7): the
/// 60-digit security code of a chat, as WhatsApp / Signal show it. The
/// algorithm is Signal's published «numeric fingerprint» (version 0, 5200
/// iterations of SHA-512 over version || keys || identifier, 30 digits a
/// person, the two halves in a stable order), written from its description
/// — libsignal itself is AGPL, so it is not copied (rule №1: idea only).
/// MLS has a key per DEVICE, so a person's part covers all their devices'
/// signature keys, sorted.
abstract final class SafetyNumber {
  static const iterations = 5200;

  /// 30 digits for one person ([userId]) and their device keys.
  static String partFor(String userId, List<Uint8List> deviceKeys) {
    final keys = [...deviceKeys]..sort(_compare);
    final joined = <int>[for (final k in keys) ...k];
    final id = utf8.encode(userId);
    var hash = sha512.convert([0, 0, ...joined, ...id]).bytes;
    for (var i = 0; i < iterations; i++) {
      hash = sha512.convert([...hash, ...joined]).bytes;
    }
    final out = StringBuffer();
    for (var i = 0; i < 30; i += 5) {
      var chunk = 0;
      for (var j = 0; j < 5; j++) {
        chunk = chunk * 256 + hash[i + j];
      }
      out.write((chunk % 100000).toString().padLeft(5, '0'));
    }
    return out.toString();
  }

  /// The chat's 60 digits: the two people's parts, the smaller id first —
  /// both phones show the same number.
  static String of({
    required String meId,
    required List<Uint8List> myKeys,
    required String otherId,
    required List<Uint8List> otherKeys,
  }) {
    final mine = partFor(meId, myKeys);
    final theirs = partFor(otherId, otherKeys);
    return meId.compareTo(otherId) <= 0 ? mine + theirs : theirs + mine;
  }

  /// 12 groups of 5, as WhatsApp lays them out (4 rows of 3).
  static List<String> groups(String digits) => [
        for (var i = 0; i < digits.length; i += 5) digits.substring(i, i + 5),
      ];

  /// What the QR code carries: our prefix and the 60 digits.
  static String qrPayload(String digits) => 'lawbid-sc:0:$digits';

  /// The digits of a scanned code, or null when it is not one of ours.
  static String? fromQr(String raw) {
    const prefix = 'lawbid-sc:0:';
    if (!raw.startsWith(prefix)) return null;
    final d = raw.substring(prefix.length);
    return RegExp(r'^\d{60}$').hasMatch(d) ? d : null;
  }

  static int _compare(Uint8List a, Uint8List b) {
    for (var i = 0; i < a.length && i < b.length; i++) {
      if (a[i] != b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  }
}
