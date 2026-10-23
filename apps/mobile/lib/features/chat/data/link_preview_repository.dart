import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';

/// Owner 2026-10-22 (checklist, link previews): what `GET /link-preview?url=`
/// knows about a web address — the API worker's endpoint (Open Graph on the
/// server, never from the phone, so the recipient's IP is not sent to the
/// linked site: WhatsApp / Telegram do the same).
@immutable
class LinkPreview {
  const LinkPreview({
    required this.url,
    this.title,
    this.description,
    this.imageUrl,
    this.siteName,
  });

  final String url;
  final String? title;
  final String? description;
  final String? imageUrl;
  final String? siteName;

  /// Something worth drawing (a bare URL with no title is not).
  bool get hasContent =>
      (title ?? '').trim().isNotEmpty ||
      (description ?? '').trim().isNotEmpty ||
      (imageUrl ?? '').trim().isNotEmpty;

  static LinkPreview? tryParse(Object? raw, {required String url}) {
    if (raw is! Map) return null;
    String? s(String k) {
      final v = raw[k];
      return v is String && v.trim().isNotEmpty ? v.trim() : null;
    }

    return LinkPreview(
      url: s('url') ?? url,
      title: s('title'),
      description: s('description'),
      imageUrl: s('imageUrl'),
      siteName: s('siteName'),
    );
  }
}

/// The first web address in a message, or null. `http(s)://…`, cut at
/// whitespace and at a closing `)` / `>` / quote; a trailing `.` or `,`
/// is punctuation, not the link.
String? firstUrlIn(String text) {
  final m = _url.firstMatch(text);
  if (m == null) return null;
  var found = m.group(0)!;
  while (found.endsWith('.') ||
      found.endsWith(',') ||
      found.endsWith(')') ||
      found.endsWith(';')) {
    found = found.substring(0, found.length - 1);
  }
  return Uri.tryParse(found)?.hasAuthority ?? false ? found : null;
}

final _url = RegExp(r'''https?://[^\s<>"']+''', caseSensitive: false);

/// Never throws: a preview or null (no endpoint yet, a 4xx/5xx, a timeout,
/// offline). Answers are kept in memory for the session and on the phone
/// by the http cache (`ApiLinkPreviewRepository.cacheTtl`), so a chat
/// scrolled twice asks once.
// ignore: one_member_abstracts
abstract interface class LinkPreviewRepository {
  Future<LinkPreview?> fetch(String url);
}

class ApiLinkPreviewRepository implements LinkPreviewRepository {
  ApiLinkPreviewRepository(this._dio, {this.maxEntries = 200});

  final Dio _dio;
  final int maxEntries;

  /// Open Graph data rarely changes; a week on the phone.
  static const cacheTtl = Duration(days: 7);

  /// url → preview (null = asked, nothing there); insertion-ordered LRU.
  final LinkedHashMap<String, LinkPreview?> _memory = LinkedHashMap();
  final Map<String, Future<LinkPreview?>> _inFlight = {};

  @override
  Future<LinkPreview?> fetch(String url) {
    if (_memory.containsKey(url)) {
      final hit = _memory.remove(url);
      _memory[url] = hit;
      return Future.value(hit);
    }
    return _inFlight[url] ??= _load(url).whenComplete(() {
      _inFlight.remove(url);
    });
  }

  Future<LinkPreview?> _load(String url) async {
    LinkPreview? preview;
    try {
      final r = await _dio.get<Object?>(
        '/link-preview',
        queryParameters: {'url': url},
        options: Options(
          extra: {...cacheFor(cacheTtl), 'noRetry': true},
          receiveTimeout: const Duration(seconds: 8),
        ),
      );
      final body = r.data;
      final data = body is Map ? body['data'] : null;
      preview = LinkPreview.tryParse(data, url: url);
      if (preview != null && !preview.hasContent) preview = null;
    } catch (e) {
      // No endpoint yet (404), a refused site, offline: the card simply
      // does not render. Never an error for the person.
      if (kDebugMode) debugPrint('link preview $url: $e');
      preview = null;
    }
    _remember(url, preview);
    return preview;
  }

  void _remember(String url, LinkPreview? preview) {
    _memory.remove(url);
    _memory[url] = preview;
    while (_memory.length > maxEntries) {
      _memory.remove(_memory.keys.first);
    }
  }
}
