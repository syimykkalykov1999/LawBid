import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:html/parser.dart' as html;
import 'package:image/image.dart' as img;
import 'package:lawbid/features/chat/data/link_preview_repository.dart'
    show firstUrlIn;
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Third pass S3 (26.11; WhatsApp Security Whitepaper «Link previews»,
/// Signal's link previews made on the sender's device — idea only): the
/// card of a link in an end-to-end encrypted chat is made by the SENDER's
/// phone, which reads the site itself, and goes inside the encrypted
/// message. The server never learns the address; the receivers draw what
/// came and fetch nothing.
///
/// The page is read the way the server does it for other chats
/// (apps/api/src/modules/link-preview/og-parser.ts: Open Graph, Twitter
/// card, plain meta; only the `<head>`), with dart-lang's HTML5 parser.
/// The picture becomes a small JPEG made here (no receiver loads it from
/// the site). Never throws; null = the message goes without a card.
class SealedLinkCards {
  SealedLinkCards({Dio? dio, this.maxEntries = 50})
      : _dio = dio ??
            Dio(
              BaseOptions(
                connectTimeout: const Duration(seconds: 4),
                receiveTimeout: const Duration(seconds: 4),
                maxRedirects: 5,
                responseType: ResponseType.stream,
                // A site's 4xx/5xx is "no card".
                validateStatus: (s) => s != null && s >= 200 && s < 300,
              ),
            );

  final Dio _dio;
  final int maxEntries;

  /// The whole card may take this long; the message never waits longer.
  static const budget = Duration(seconds: 6);

  /// Only the start of a page is read (the `<head>` is there).
  static const maxPageBytes = 512 * 1024;
  static const maxImageBytes = 4 * 1024 * 1024;

  /// The picture's width (the card is 240 pt wide; sharp at 1.5x and the
  /// message stays small).
  static const thumbWidth = 360;

  final LinkedHashMap<String, SealedLinkCard?> _memory = LinkedHashMap();

  /// The card of the first link in [body], or null.
  Future<SealedLinkCard?> build(String body) async {
    // The website cannot read other sites (CORS); there it goes without.
    if (kIsWeb) return null;
    final url = firstUrlIn(body);
    if (url == null) return null;
    if (_memory.containsKey(url)) return _memory[url];
    SealedLinkCard? card;
    try {
      card = await _make(url).timeout(budget);
    } on Object catch (e) {
      if (kDebugMode) debugPrint('sealed link card $url: $e');
      card = null;
    }
    _memory[url] = card;
    while (_memory.length > maxEntries) {
      _memory.remove(_memory.keys.first);
    }
    return card;
  }

  Future<SealedLinkCard?> _make(String url) async {
    final page =
        await _read(url, maxPageBytes, (type) => type.contains('html'));
    if (page == null) return null;
    final meta = parseOpenGraph(
      utf8.decode(page.bytes, allowMalformed: true),
      page.finalUrl,
    );
    Uint8List? thumb;
    final image = meta.imageUrl;
    if (image != null) {
      final got = await _read(
        image,
        maxImageBytes,
        (type) => type.startsWith('image/'),
      );
      if (got != null) thumb = await compute(makeLinkThumbnail, got.bytes);
    }
    final card = SealedLinkCard(
      url: url,
      title: meta.title,
      description: meta.description,
      siteName: meta.siteName,
      thumbnail: thumb,
    );
    return card.hasContent ? card : null;
  }

  /// The first [limit] bytes of [url] when its type passes [accept].
  Future<({Uint8List bytes, Uri finalUrl})?> _read(
    String url,
    int limit,
    bool Function(String type) accept,
  ) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.isScheme('https') || uri.isScheme('http'))) {
      return null;
    }
    final r = await _dio.getUri<ResponseBody>(uri);
    final body = r.data;
    if (body == null) return null;
    final type =
        (r.headers.value(Headers.contentTypeHeader) ?? '').toLowerCase();
    if (!accept(type)) return null;
    final out = BytesBuilder(copy: false);
    await for (final chunk in body.stream) {
      out.add(chunk);
      if (out.length >= limit) break;
    }
    final bytes = out.takeBytes();
    return (
      bytes: bytes.length > limit
          ? Uint8List.sublistView(bytes, 0, limit)
          : bytes,
      finalUrl: r.realUri,
    );
  }
}

/// What a page says about itself.
typedef OpenGraph = ({
  String? title,
  String? description,
  String? imageUrl,
  String? siteName,
});

const _titleMax = 200;
const _descriptionMax = 300;
const _siteMax = 100;
const _headFallback = 128 * 1024;

// Control characters, zero-width and bidi-override marks (spoofing).
final _control = RegExp(
  r'[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]',
);
final _spaces = RegExp(r'\s+');

String? _clean(String? raw, int max) {
  if (raw == null) return null;
  final s = raw.replaceAll(_control, ' ').replaceAll(_spaces, ' ').trim();
  if (s.isEmpty) return null;
  return s.length > max ? '${s.substring(0, max - 1).trimRight()}…' : s;
}

String? _absoluteImage(String? raw, Uri base) {
  if (raw == null || raw.trim().isEmpty) return null;
  final u = Uri.tryParse(raw.trim());
  if (u == null) return null;
  final abs = base.resolveUri(u);
  if (!(abs.isScheme('https') || abs.isScheme('http'))) return null;
  if (abs.userInfo.isNotEmpty) return null;
  final s = abs.toString();
  return s.length <= 2048 ? s : null;
}

/// Open Graph / Twitter card / plain meta of [page] (a port of the
/// server's og-parser.ts: same fields, order and limits). [base] is the
/// final address, for relative picture paths.
OpenGraph parseOpenGraph(String page, Uri base) {
  final end = RegExp(r'</head\s*>', caseSensitive: false).firstMatch(page);
  final head = end != null
      ? page.substring(0, end.end)
      : page.substring(
          0,
          page.length < _headFallback ? page.length : _headFallback,
        );
  final doc = html.parse(head);
  final metas = doc.getElementsByTagName('meta');
  String? meta(List<String> names) {
    for (final name in names) {
      for (final e in metas) {
        final a = (e.attributes['property'] ?? e.attributes['name'] ?? '')
            .toLowerCase();
        if (a != name) continue;
        final content = e.attributes['content'];
        if (content != null && content.trim().isNotEmpty) return content;
        break;
      }
    }
    return null;
  }

  final titles = doc.getElementsByTagName('title');
  final title = _clean(meta(['og:title', 'twitter:title']), _titleMax) ??
      _clean(titles.isEmpty ? null : titles.first.text, _titleMax);
  return (
    title: title,
    description: _clean(
      meta(['og:description', 'twitter:description', 'description']),
      _descriptionMax,
    ),
    imageUrl: _absoluteImage(
      meta([
        'og:image:secure_url',
        'og:image',
        'og:image:url',
        'twitter:image',
      ]),
      base,
    ),
    siteName: _clean(meta(['og:site_name', 'application-name']), _siteMax) ??
        _clean(base.host.replaceFirst(RegExp(r'^www\.'), ''), _siteMax),
  );
}

/// A site's picture as the small JPEG that travels inside the encryption
/// (null = none fits). Runs in a background isolate.
Uint8List? makeLinkThumbnail(Uint8List bytes) {
  try {
    // A huge picture (a decompression bomb) is not decoded at all.
    final decoder = img.findDecoderForData(bytes);
    final info = decoder?.startDecode(bytes);
    if (decoder == null ||
        info == null ||
        info.width * info.height > 40 * 1000 * 1000) {
      return null;
    }
    final decoded = decoder.decode(bytes);
    if (decoded == null) return null;
    final small = decoded.width > SealedLinkCards.thumbWidth
        ? img.copyResize(decoded, width: SealedLinkCards.thumbWidth)
        : decoded;
    // base64 grows by 4/3: the bytes must fit the payload's limit.
    const maxBytes = SealedLinkCard.maxThumbnailB64 * 3 ~/ 4;
    for (final q in const [70, 55, 40]) {
      final jpg = img.encodeJpg(small, quality: q);
      if (jpg.length <= maxBytes) return jpg;
    }
    return null;
  } on Object {
    return null;
  }
}
