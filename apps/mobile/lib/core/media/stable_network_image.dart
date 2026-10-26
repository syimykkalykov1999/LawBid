import 'dart:async';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

/// Owner 2026-10-26 («аватарки собеседников иногда не показываются»): a
/// network picture that is
///  - kept on the phone under the FILE's address ([stableImageCacheKey]:
///    a signed link changes with every answer, the file does not), so a
///    picture seen once never needs the network again;
///  - retried when a fresh link arrives after a failed one. The previous
///    provider (cached_network_image) compared equal by that same stable
///    key, so after one failed load (an expired signed link from the saved
///    chat list, a dropped connection) the `Image` kept its error and the
///    avatar stayed letters until the screen was rebuilt from scratch —
///    even though the next answer brought a working link;
///  - falling back to the full picture when its preview is missing
///    (`…_w256` 404 — seeded / older avatars had none) and to any
///    [fallbackUrls] the caller has (a chat's full-size photo).
///
/// Looks exactly like before (same decode, same placement); only loading
/// is more reliable.
@immutable
class StableNetworkImage extends ImageProvider<StableNetworkImage> {
  StableNetworkImage(
    this.url, {
    this.fallbackUrls = const [],
    BaseCacheManager? cacheManager,
    this.scale = 1.0,
  })  : cacheKey = stableImageCacheKey(url) ?? url,
        _cacheManager = cacheManager,
        retryToken = _retryTokenFor(stableImageCacheKey(url) ?? url, url);

  final String url;
  final List<String> fallbackUrls;
  final double scale;

  /// Where the picture is kept on the phone (the file, not the link).
  final String cacheKey;

  /// Empty normally; the link itself when an earlier load of the same file
  /// failed with a different link — then this provider differs from the
  /// failed one, so the `Image` showing the failure loads again.
  final String retryToken;

  final BaseCacheManager? _cacheManager;

  /// cacheKey → the link that failed last (removed on success).
  static final Map<String, String> _failedWith = {};

  static String _retryTokenFor(String cacheKey, String url) {
    final failed = _failedWith[cacheKey];
    return failed != null && failed != url ? url : '';
  }

  @visibleForTesting
  static void resetFailures() => _failedWith.clear();

  /// Where the picture is kept (appNetworkImage passes the feed cache).
  BaseCacheManager get cacheManager => _cacheManager ?? DefaultCacheManager();

  /// The links tried, in order: the given one, the full picture when the
  /// given one is a public `…_w<px>` preview, then [fallbackUrls].
  List<String> get candidates {
    final out = <String>[url];
    final full = fullPictureOf(url);
    if (full != null) out.add(full);
    for (final f in fallbackUrls) {
      if (f.isNotEmpty && !out.contains(f)) out.add(f);
    }
    return out;
  }

  @override
  Future<StableNetworkImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture<StableNetworkImage>(this);

  @override
  ImageStreamCompleter loadImage(
    StableNetworkImage key,
    ImageDecoderCallback decode,
  ) {
    if (kIsWeb) {
      // The browser loads pictures itself (an <img> needs no CORS); the
      // retry on a fresh link still applies through [retryToken].
      final web = CachedNetworkImageProvider(key.url, cacheKey: key.cacheKey);
      return web.loadImage(web, decode);
    }
    return MultiFrameImageStreamCompleter(
      codec: key._load(decode),
      scale: key.scale,
      debugLabel: key.cacheKey,
      informationCollector: () => [
        DiagnosticsProperty<String>('Cache key', key.cacheKey),
      ],
    );
  }

  Future<ui.Codec> _load(ImageDecoderCallback decode) async {
    Object? lastError;
    for (final link in candidates) {
      final key = stableImageCacheKey(link) ?? link;
      try {
        final file = await cacheManager.getSingleFile(link, key: key);
        final bytes = await file.readAsBytes();
        if (bytes.isEmpty) throw StateError('empty picture');
        final codec =
            await decode(await ui.ImmutableBuffer.fromUint8List(bytes));
        _failedWith.remove(cacheKey);
        return codec;
      } on Object catch (e) {
        lastError = e;
        // A broken file on the phone must not stick.
        try {
          await cacheManager.removeFile(key);
        } on Object {
          // nothing kept
        }
      }
    }
    _failedWith[cacheKey] = url;
    // Reaches the Image's errorBuilder (the letters under the photo stay
    // visible) — never a red screen.
    final error = lastError;
    if (error is Exception) throw error;
    if (error is Error) throw error;
    throw StateError('picture not loaded: $error');
  }

  @override
  bool operator ==(Object other) =>
      other is StableNetworkImage &&
      other.cacheKey == cacheKey &&
      other.retryToken == retryToken &&
      other.scale == scale;

  @override
  int get hashCode => Object.hash(cacheKey, retryToken, scale);

  @override
  String toString() =>
      '${objectRuntimeType(this, 'StableNetworkImage')}("$cacheKey")';
}

/// Owner 2026-10-18 (speed): the cache key of a picture link. A signed
/// storage link (S3/R2/MinIO `X-Amz-…`, CDN `Signature`/`Expires`, GCS
/// `X-Goog-…`) gets a new query on every API response, so caching by the
/// whole link missed the disk and memory caches every time; its path
/// names the file (`purpose/user/fileId[/variant]`), so that is the key.
/// Any other link keeps its whole address as the key (null), since its
/// query may name the picture.
String? stableImageCacheKey(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasQuery || uri.path.isEmpty) return null;
  final params = uri.queryParameters.keys;
  final signed = params.any(
    (k) =>
        k.startsWith('X-Amz-') ||
        k.startsWith('X-Goog-') ||
        k == 'Signature' ||
        k == 'Expires' ||
        k == 'Key-Pair-Id',
  );
  return signed ? uri.path : null;
}

final _variant = RegExp(r'_w\d+(\.avif)?$');

/// The full picture of a public preview link (`…/<file>_w256` →
/// `…/<file>`, the storage's variant naming); null when [url] is not a
/// preview or is signed (a signature covers the exact path).
String? fullPictureOf(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null || !_variant.hasMatch(uri.path)) return null;
  if (stableImageCacheKey(url) != null) return null;
  return uri.replace(path: uri.path.replaceFirst(_variant, '')).toString();
}
