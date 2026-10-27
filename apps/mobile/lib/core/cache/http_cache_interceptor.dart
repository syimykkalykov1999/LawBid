import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:lawbid/core/cache/network_usage.dart';

/// `Options.extra` key: an answer fetched within this many seconds is
/// handed back from the phone with **no request** (plan §4 package D,
/// `swr(maxAge)`); older than that, the server is asked with
/// `If-None-Match` (a 304 costs no bytes).
const kCacheMaxAgeExtra = 'cacheMaxAge';

/// Set on `Response.extra` when the answer came from the cache without a
/// request (a max-age hit) or after a 304.
const kFromCacheExtra = 'fromCache';

/// Set on `Response.extra` (next to [kFromCacheExtra]) when the answer is
/// an old copy served because the server could not be reached or answered
/// 502 / 503 / 504 (RFC 5861 `stale-if-error`, caching round 2, S2-4).
const kStaleExtra = 'stale';

/// Request extras for a GET that may be served from the phone for [maxAge].
Map<String, dynamic> cacheFor(Duration maxAge) => {
      kCacheMaxAgeExtra: maxAge.inSeconds,
    };

/// [Options] for a GET that may be served from the phone for [maxAge].
Options cachedFor(Duration maxAge) => Options(extra: cacheFor(maxAge));

/// One remembered GET answer.
class HttpCacheEntry {
  const HttpCacheEntry({
    required this.etag,
    required this.data,
    required this.bytes,
    required this.fetchedAt,
  });

  final String etag;
  final Object? data;
  final int bytes;

  /// When the server last confirmed this body (a 200, or a 304 on it).
  final DateTime fetchedAt;

  HttpCacheEntry confirmed(DateTime at) =>
      HttpCacheEntry(etag: etag, data: data, bytes: bytes, fetchedAt: at);
}

/// The disk layer (a Drift table): every method must swallow its own
/// failures — a broken disk is just "no copy".
abstract interface class HttpCacheStore {
  Future<HttpCacheEntry?> read(String key);
  Future<void> write(String key, HttpCacheEntry entry, String json);
  Future<void> touch(String key, DateTime now, {required bool confirmed});
  Future<void> clear();
}

/// Owner 2026-10-22 (client economy plan, package D): the ETag /
/// `If-None-Match` / 304 cache (it replaced the old in-memory-only
/// interceptor, deleted in the dedup cleanup), with a copy on disk, so a
/// cold start gets a 304 on
/// bootstrap, the session, pricing, legal texts, stickers and the own
/// profile instead of downloading them again. Memory stays the first
/// level (least-recently-used out first); the disk is the second.
///
/// Nothing is shown stale by itself: an answer is served without a request
/// only when the caller allowed it for that long ([cacheFor]).
class HttpCacheInterceptor extends Interceptor {
  HttpCacheInterceptor({
    HttpCacheStore? disk,
    NetworkUsageCounter? usage,
    this.maxEntries = 120,
    this.maxBytes = 16 * 1024 * 1024,
    this.maxDiskBodyBytes = 1024 * 1024,
    this.staleOnError = const Duration(hours: 8),
    DateTime Function()? now,
  })  : _disk = disk,
        _usage = usage,
        _now = now ?? DateTime.now;

  final HttpCacheStore? _disk;
  final NetworkUsageCounter? _usage;
  final DateTime Function() _now;
  final int maxEntries;
  final int maxBytes;

  /// Bodies longer than this stay in memory only (a list page of 2 MB has
  /// no business on the disk).
  final int maxDiskBodyBytes;

  /// How old a copy may be and still stand in for a failed request
  /// (no network, timeout, 502-504). `Duration.zero` switches it off.
  final Duration staleOnError;

  static const _keyExtra = 'httpCacheKey';
  static const _leaderExtra = 'httpCacheLeader';

  /// `Options.extra` flag: never share this GET with an identical one in
  /// flight (a poll that must reach the server).
  static const noCoalesceExtra = 'noCoalesce';

  /// S15-12: identical GETs in flight right now (key → the leader's answer,
  /// null when the leader failed and each follower must ask for itself).
  final _inFlight = <String, Completer<Response<dynamic>?>>{};

  static const _hitExtra = 'httpCacheHit';

  final _entries = <String, HttpCacheEntry>{};
  int _bytes = 0;

  @visibleForTesting
  int get length => _entries.length;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.method.toUpperCase() != 'GET' ||
        options.responseType != ResponseType.json) {
      handler.next(options);
      return;
    }
    final key = _key(options);
    options.extra[_keyExtra] = key;
    var hit = _entries.remove(key);
    if (hit != null) {
      _entries[key] = hit; // most recently used goes last
    } else {
      hit = await _readDisk(key);
      if (hit != null) _put(key, hit);
    }
    if (hit == null) {
      if (await _followOrLead(options, key, handler)) return;
      handler.next(options);
      return;
    }
    final maxAge = options.extra[kCacheMaxAgeExtra];
    if (maxAge is int &&
        maxAge > 0 &&
        _now().difference(hit.fetchedAt).inSeconds <= maxAge) {
      _usage?.servedLocally();
      _touchDisk(key, confirmed: false);
      handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          data: hit.data,
          statusCode: 200,
          extra: {kFromCacheExtra: true},
        ),
      );
      return;
    }
    options.headers['If-None-Match'] = hit.etag;
    // Held on the request itself: an eviction between the request and its
    // 304 must not turn the answer into an error.
    options.extra[_hitExtra] = hit;
    if (await _followOrLead(options, key, handler)) return;
    handler.next(options);
  }

  /// S15-12: two widgets asking the same URL at the same moment sent two
  /// requests. The first one (the leader) goes out; an identical GET that
  /// arrives while it is in flight waits for its answer and gets the same
  /// body, with no request of its own. Returns true when [handler] was
  /// resolved here. A leader that fails (or is retried) answers nobody: each
  /// follower then asks for itself, so an error is never shared. The cache
  /// key carries the user and language, so answers never cross accounts.
  Future<bool> _followOrLead(
    RequestOptions options,
    String key,
    RequestInterceptorHandler handler,
  ) async {
    if (options.extra[noCoalesceExtra] == true ||
        options.extra[_leaderExtra] == true) {
      // Opted out, or the leader itself coming round again (a retry / a
      // repeat after a token refresh re-enters through `dio.fetch`).
      return false;
    }
    final leader = _inFlight[key];
    if (leader == null) {
      options.extra[_leaderExtra] = true;
      _inFlight[key] = Completer<Response<dynamic>?>();
      return false;
    }
    final shared = await leader.future;
    if (shared == null) {
      // The leader failed: this request becomes a leader of its own when
      // nobody else took over meanwhile.
      if (_inFlight[key] == null) {
        options.extra[_leaderExtra] = true;
        _inFlight[key] = Completer<Response<dynamic>?>();
      }
      return false;
    }
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        data: shared.data,
        statusCode: shared.statusCode,
        headers: shared.headers,
        extra: {...shared.extra, 'coalesced': true},
      ),
    );
    return true;
  }

  void _finish(RequestOptions options, Response<dynamic>? answer) {
    if (options.extra[_leaderExtra] != true) return;
    final key = options.extra[_keyExtra] as String?;
    if (key == null) return;
    final done = _inFlight.remove(key);
    if (done != null && !done.isCompleted) done.complete(answer);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final key = response.requestOptions.extra[_keyExtra] as String?;
    final etag = response.headers.value('etag');
    final data = response.data;
    final length = int.tryParse(response.headers.value('content-length') ?? '');
    _usage?.request(bytes: length ?? _roughSize(data));
    if (key != null &&
        response.statusCode == 200 &&
        etag != null &&
        etag.isNotEmpty &&
        (data is Map || data is List) &&
        !(response.headers.value('cache-control') ?? '').contains('no-store')) {
      final json = jsonEncode(data);
      final entry = HttpCacheEntry(
        etag: etag,
        data: data,
        bytes: json.length * 4,
        fetchedAt: _now(),
      );
      _put(key, entry);
      if (json.length <= maxDiskBodyBytes) _writeDisk(key, entry, json);
    }
    _finish(response.requestOptions, response);
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final res = err.response;
    final hit = err.requestOptions.extra[_hitExtra];
    if (res != null && res.statusCode == 304 && hit is HttpCacheEntry) {
      _usage?.notModified();
      final key = err.requestOptions.extra[_keyExtra] as String?;
      final fresh = hit.confirmed(_now());
      if (key != null) {
        _put(key, fresh);
        _touchDisk(key, confirmed: true);
      }
      final answer = Response<dynamic>(
        requestOptions: err.requestOptions,
        data: hit.data,
        statusCode: 200,
        headers: res.headers,
        extra: {kFromCacheExtra: true},
      );
      _finish(err.requestOptions, answer);
      handler.resolve(answer);
      return;
    }
    // Caching round 2 (S2-4): stale-if-error. The phone already holds a
    // good copy; a dead network or a gateway error must not replace it with
    // an error screen. 401 / 403 / 404 / 5xx other than 502-504 still
    // reach the caller (they say something the copy cannot).
    if (hit is HttpCacheEntry &&
        _isOutage(err) &&
        staleOnError > Duration.zero &&
        _now().difference(hit.fetchedAt) <= staleOnError) {
      // The leader's outage is not shared: followers ask for themselves
      // (and get the same stale copy if the outage goes on).
      _finish(err.requestOptions, null);
      handler.resolve(
        Response<dynamic>(
          requestOptions: err.requestOptions,
          data: hit.data,
          statusCode: 200,
          extra: {kFromCacheExtra: true, kStaleExtra: true},
        ),
      );
      return;
    }
    if (res != null) _usage?.request(bytes: _roughSize(res.data));
    _finish(err.requestOptions, null);
    handler.next(err);
  }

  /// True for "could not reach the server" and the gateway statuses.
  static bool _isOutage(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      case DioExceptionType.badResponse:
        final code = err.response?.statusCode;
        return code == 502 || code == 503 || code == 504;
      case DioExceptionType.unknown:
        // A socket / TLS failure surfaces as `unknown` with the cause.
        final cause = err.error;
        return cause != null &&
            cause.runtimeType.toString().contains('SocketException');
      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
      case DioExceptionType.transformTimeout:
        return false;
    }
  }

  /// Forgets everything in memory (and on disk when [disk] is true).
  Future<void> clear({bool disk = true}) async {
    _entries.clear();
    _bytes = 0;
    if (disk) await _disk?.clear();
  }

  void _put(String key, HttpCacheEntry entry) {
    final old = _entries.remove(key);
    if (old != null) _bytes -= old.bytes;
    _entries[key] = entry;
    _bytes += entry.bytes;
    while (_entries.length > maxEntries || _bytes > maxBytes) {
      final oldest = _entries.keys.first;
      _bytes -= _entries.remove(oldest)!.bytes;
    }
  }

  Future<HttpCacheEntry?> _readDisk(String key) async {
    final disk = _disk;
    if (disk == null) return null;
    try {
      return await disk.read(key);
    } on Object catch (e) {
      debugPrint('http cache read: $e');
      return null;
    }
  }

  void _writeDisk(String key, HttpCacheEntry entry, String json) {
    final disk = _disk;
    if (disk == null) return;
    disk
        .write(key, entry, json)
        .catchError((Object e) => debugPrint('http cache write: $e'));
  }

  void _touchDisk(String key, {required bool confirmed}) {
    final disk = _disk;
    if (disk == null) return;
    disk
        .touch(key, _now(), confirmed: confirmed)
        .catchError((Object e) => debugPrint('http cache touch: $e'));
  }

  static int _roughSize(Object? data) {
    if (data == null) return 0;
    if (data is String) return data.length;
    if (data is List<int>) return data.length;
    try {
      return jsonEncode(data).length;
    } on Object {
      return 0;
    }
  }

  /// One entry per user and language: another account (or a language
  /// switch) never sees someone else's, or an other-language, answer.
  String _key(RequestOptions options) {
    final auth =
        options.headers['Authorization'] ?? options.headers['authorization'];
    final lang = options.headers['Accept-Language'] ??
        options.headers['accept-language'];
    return '${bearerSubject(auth)}|$lang|${options.uri}';
  }
}

/// The `sub` of a bearer token (the token itself changes on every refresh;
/// the user does not), or `anon`.
String bearerSubject(Object? authorization) {
  if (authorization is! String || !authorization.startsWith('Bearer ')) {
    return 'anon';
  }
  final parts = authorization.substring(7).split('.');
  if (parts.length != 3) return 'anon';
  try {
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    final sub = payload is Map ? payload['sub'] : null;
    return sub is String && sub.isNotEmpty ? sub : 'anon';
  } on Object {
    return 'anon';
  }
}
