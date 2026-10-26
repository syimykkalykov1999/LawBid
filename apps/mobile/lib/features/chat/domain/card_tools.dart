import 'dart:convert';

import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Escapes a vCard text value (RFC 6350 §3.4).
String _esc(String s) => s
    .replaceAll(r'\', r'\\')
    .replaceAll('\r\n', r'\n')
    .replaceAll('\n', r'\n')
    .replaceAll(',', r'\,')
    .replaceAll(';', r'\;');

/// Folds a content line at 75 octets (RFC 6350 §3.2) without cutting a
/// UTF-8 character.
String _fold(String line) {
  if (utf8.encode(line).length <= 75) return line;
  final out = StringBuffer();
  var bytes = 0;
  var limit = 75;
  for (final rune in line.runes) {
    final ch = String.fromCharCode(rune);
    final n = utf8.encode(ch).length;
    if (bytes + n > limit) {
      out.write('\r\n ');
      bytes = 1;
      limit = 75;
    }
    out.write(ch);
    bytes += n;
  }
  return out.toString();
}

/// Owner 2026-10-20: the shared attorney as a `.vcf` card (vCard 3.0, which
/// every phone's Contacts reads). Only the public profile goes in: the name,
/// the firm, the profile link, the practice and the licensed states — never a
/// phone or an e-mail, which LawBid keeps private.
///
/// [role] is the localized «Attorney»; [practice] the localized practice
/// areas; [profileUrl] the public page (`https://lawbid.dev/lawyer/…`).
String buildVCard(
  ContactCard c, {
  required String role,
  required List<String> practice,
  required String profileUrl,
}) {
  final name = c.displayName.trim();
  final space = name.lastIndexOf(' ');
  final given = space < 0 ? name : name.substring(0, space);
  final family = space < 0 ? '' : name.substring(space + 1);
  final notes = [
    if (practice.isNotEmpty) practice.join(', '),
    if (c.licensedStates.isNotEmpty) c.licensedStates.join(', '),
    '@${c.username} · LawBid',
  ].join('\n');
  final lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'PRODID:-//LawBid//Chat card//EN',
    'FN:${_esc(name)}',
    'N:${_esc(family)};${_esc(given)};;;',
    'NICKNAME:${_esc(c.username)}',
    if (c.firmNames.isNotEmpty) 'ORG:${_esc(c.firmNames.first)}',
    'TITLE:${_esc(role)}',
    'URL:$profileUrl',
    'NOTE:${_esc(notes)}',
    'END:VCARD',
  ];
  return '${lines.map(_fold).join('\r\n')}\r\n';
}

/// A file name for the card: letters, digits, dash, underscore (no dots, so
/// a name can never be `..`).
String vCardFileName(ContactCard c) {
  final base = c.displayName
      .trim()
      .replaceAll(RegExp(r'\s+'), '_')
      .replaceAll(RegExp(r'[^\p{L}\p{N}_-]', unicode: true), '');
  return '${base.isEmpty ? c.username : base}.vcf';
}

/// A link that opens [address] in the phone's maps: Apple Maps on iPhone,
/// Google Maps' universal link elsewhere. No map tiles are loaded by the
/// app, no key, no cost.
Uri mapsUri(String address, {required bool apple}) {
  final q = address.trim();
  return apple
      ? Uri.https('maps.apple.com', '/', {'q': q})
      : Uri.https('www.google.com', '/maps/search/', {
          'api': '1',
          'query': q,
        });
}
