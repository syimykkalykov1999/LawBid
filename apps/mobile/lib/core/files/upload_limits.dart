import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';

/// Owner 2026-10-07 (bug 17): upload limits the owner sets in the admin
/// panel (Система → «Загрузки и файлы»), sent in bootstrap app_config as
/// `uploads.limits`. The server enforces them too; the app uses them to
/// show counters, offer only the allowed formats and stop early. Unknown
/// or missing values fall back to the defaults below (same as the API's
/// apps/api/src/modules/files/upload-limits.ts).
enum UploadPlace {
  post,
  reel,
  kase('case'),
  chat,
  task,
  review,
  avatar,
  verification,
  clientBadge('client_badge');

  const UploadPlace([this._key]);
  final String? _key;
  String get key => _key ?? name;
}

/// MIME of each format an admin may turn on (all safe).
const kUploadFormatMime = <String, String>{
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'heic': 'image/heic',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'odt': 'application/vnd.oasis.opendocument.text',
  'ods': 'application/vnd.oasis.opendocument.spreadsheet',
  'odp': 'application/vnd.oasis.opendocument.presentation',
  'rtf': 'application/rtf',
  'txt': 'text/plain',
  'csv': 'text/csv',
};

const kPhotoFormats = {'jpeg', 'png', 'heic', 'webp', 'gif'};

/// File-name extensions of a format (what the picker offers).
const _extensions = <String, List<String>>{
  'jpeg': ['jpg', 'jpeg'],
  'heic': ['heic', 'heif'],
};

class PlaceUploadLimits {
  const PlaceUploadLimits({
    required this.maxPhotos,
    required this.maxFiles,
    required this.fileMb,
    required this.totalMb,
    required this.formats,
  });

  /// Photos per item (posts, reels, reviews).
  final int maxPhotos;

  /// Documents per post / reel, or photos and documents together.
  final int maxFiles;
  final int fileMb;

  /// MB of all documents of one post / reel.
  final int totalMb;
  final Set<String> formats;

  int get fileBytes => fileMb * 1024 * 1024;
  int get totalBytes => totalMb * 1024 * 1024;

  /// Document formats that are on, as picker extensions.
  List<String> get documentExtensions => [
        for (final f in formats)
          if (!kPhotoFormats.contains(f)) ...(_extensions[f] ?? [f]),
      ];

  /// Every format that is on, as picker extensions.
  List<String> get allExtensions => [
        for (final f in formats) ...(_extensions[f] ?? [f]),
      ];

  /// MIME of a file name when its format is on here, else null.
  String? mimeForName(String name) {
    final dot = name.lastIndexOf('.');
    final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
    for (final f in formats) {
      if ((_extensions[f] ?? [f]).contains(ext)) return kUploadFormatMime[f];
    }
    return null;
  }

  bool allowsMime(String mime) =>
      formats.any((f) => kUploadFormatMime[f] == mime);

  PlaceUploadLimits _merge(Object? raw) {
    if (raw is! Map) return this;
    int n(String k, int d) => raw[k] is num ? (raw[k] as num).toInt() : d;
    final f = raw['formats'];
    return PlaceUploadLimits(
      maxPhotos: n('maxPhotos', maxPhotos),
      maxFiles: n('maxFiles', maxFiles),
      fileMb: n('fileMb', fileMb),
      totalMb: n('totalMb', totalMb),
      formats: f is List
          ? {
              for (final x in f)
                if (x is String && kUploadFormatMime.containsKey(x)) x,
            }
          : formats,
    );
  }
}

const _postFormats = {
  'jpeg',
  'png',
  'heic',
  'pdf',
  'doc',
  'docx',
  'txt',
  'rtf',
  'odt',
};

/// Defaults = what the app allowed before bug 17.
const kDefaultUploadLimits = <UploadPlace, PlaceUploadLimits>{
  UploadPlace.post: PlaceUploadLimits(
    maxPhotos: 9,
    maxFiles: 9,
    fileMb: 10,
    totalMb: 30,
    formats: _postFormats,
  ),
  UploadPlace.reel: PlaceUploadLimits(
    maxPhotos: 9,
    maxFiles: 9,
    fileMb: 10,
    totalMb: 30,
    formats: _postFormats,
  ),
  UploadPlace.kase: PlaceUploadLimits(
    maxPhotos: 0,
    maxFiles: 9,
    fileMb: 10,
    totalMb: 0,
    formats: {'jpeg', 'png', 'heic', 'pdf', 'docx'},
  ),
  UploadPlace.chat: PlaceUploadLimits(
    maxPhotos: 0,
    maxFiles: 0,
    fileMb: 25,
    totalMb: 0,
    formats: {...kPhotoFormats, ..._docs},
  ),
  UploadPlace.task: PlaceUploadLimits(
    maxPhotos: 0,
    maxFiles: 10,
    fileMb: 25,
    totalMb: 0,
    formats: {...kPhotoFormats, ..._docs},
  ),
  UploadPlace.review: PlaceUploadLimits(
    maxPhotos: 10,
    maxFiles: 0,
    fileMb: 10,
    totalMb: 0,
    formats: {'jpeg', 'png', 'heic'},
  ),
  UploadPlace.avatar: PlaceUploadLimits(
    maxPhotos: 0,
    maxFiles: 0,
    fileMb: 5,
    totalMb: 0,
    formats: {'jpeg', 'png', 'heic'},
  ),
  UploadPlace.verification: PlaceUploadLimits(
    maxPhotos: 0,
    maxFiles: 3,
    fileMb: 10,
    totalMb: 0,
    formats: {'jpeg', 'png', 'heic', 'pdf'},
  ),
  UploadPlace.clientBadge: PlaceUploadLimits(
    maxPhotos: 0,
    maxFiles: 5,
    fileMb: 0,
    totalMb: 0,
    formats: {},
  ),
};

const _docs = {
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'txt',
  'csv',
};

class UploadLimits {
  const UploadLimits(this._places);

  /// Parses the bootstrap value (a JSON object as text); anything broken
  /// keeps the defaults.
  factory UploadLimits.parse(String? json) {
    Object? raw;
    try {
      raw = json == null ? null : jsonDecode(json);
    } on FormatException {
      raw = null;
    }
    return UploadLimits({
      for (final p in UploadPlace.values)
        p: kDefaultUploadLimits[p]!._merge(raw is Map ? raw[p.key] : null),
    });
  }

  static const defaults = UploadLimits(kDefaultUploadLimits);

  final Map<UploadPlace, PlaceUploadLimits> _places;

  PlaceUploadLimits operator [](UploadPlace place) =>
      _places[place] ?? kDefaultUploadLimits[place]!;
}

final uploadLimitsProvider = Provider<UploadLimits>(
  (ref) => UploadLimits.parse(
    ref.watch(featureFlagsControllerProvider).appConfig['uploads.limits'],
  ),
);

/// MIME of a file name among the safe formats (the server re-checks the
/// bytes), else null.
String? uploadMimeForName(String name) {
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  for (final f in kUploadFormatMime.keys) {
    if ((_extensions[f] ?? [f]).contains(ext)) return kUploadFormatMime[f];
  }
  return null;
}
