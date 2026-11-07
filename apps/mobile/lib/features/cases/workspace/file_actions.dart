import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/media_cache_dir.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/browser_download.dart';
import 'package:lawbid/core/files/open_local_file.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// What a cached file needs: its id (the name on disk), type and link.
/// Owner 2026-10-13: a post's document uses the same cache as a case file.
class FileRef {
  const FileRef({required this.fileId, required this.mime, required this.url});

  FileRef.of(api.WorkspaceFileDto f)
      : fileId = f.fileId,
        mime = f.mime,
        url = f.url;

  final String fileId;
  final String mime;
  final String url;
}

/// Owner 2026-10-13: a case file is downloaded once and kept on the device;
/// "Open" then never downloads it again. A photo opens in the gallery, a
/// document in the system viewer. Owner 2026-11-05: kept until someone deletes
/// it (the system, «Данные и память», leaving the account); then it is simply
/// downloaded again. Named by the file's id, never by its signed link.
class CaseFileCache {
  /// The app-support directory in a test.
  @visibleForTesting
  static Future<Directory> Function()? debugRoot;

  static Future<File> _target(FileRef f) async {
    final root = await (debugRoot ?? getApplicationSupportDirectory)();
    final dir = Directory('${root.path}/$caseFilesFolder');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return File('${dir.path}/${f.fileId}.${_ext(f.mime)}');
  }

  static String _ext(String mime) => switch (mime) {
        'application/pdf' => 'pdf',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/jpeg' => 'jpg',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' =>
          'docx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' =>
          'xlsx',
        _ => 'bin',
      };

  /// The browser keeps nothing here: every tap is a download to its own list.
  static Future<bool> isDownloaded(FileRef f) async =>
      !kIsWeb && (await _target(f)).existsSync();

  /// A cut download not resumed for this long is given up.
  static const keepPartsFor = Duration(days: 7);

  /// Deletes broken downloads (finished files stay, owner 2026-11-05). Runs
  /// once in the background at app start; never throws.
  static Future<void> cleanUp({DateTime? now}) async {
    if (kIsWeb) return;
    try {
      final dir = Directory(
        '${(await getApplicationSupportDirectory()).path}/$caseFilesFolder',
      );
      await cleanUpDir(dir, now: now ?? DateTime.now());
    } on Object {
      // Best effort: the next start tries again.
    }
  }

  @visibleForTesting
  static Future<void> cleanUpDir(Directory dir, {required DateTime now}) async {
    if (!dir.existsSync()) return;
    await for (final e in dir.list(followLinks: false)) {
      if (e is! File || !e.path.endsWith('.part')) continue;
      try {
        if (now.difference(e.lastModifiedSync()) > keepPartsFor) {
          await e.delete();
        }
      } on Object {
        // In use or already gone: skip it.
      }
    }
  }

  static Future<File?> download(
    FileRef f, {
    void Function(double progress)? onProgress,
  }) async {
    if (kIsWeb) return null;
    final file = await _target(f);
    if (file.existsSync()) {
      // Used now: the cache cap takes the least recently used first.
      try {
        file.setLastModifiedSync(DateTime.now());
      } on Object {
        // Read-only file system: keep using it.
      }
      return file;
    }
    // Resumes a cut transfer from its `.part` file (Range) and shares one
    // transfer between two taps.
    return ResumableDownload.instance.fetch(
      f.url,
      file,
      onProgress: onProgress,
    );
  }

  /// The computer's own download of the file.
  static Future<void> downloadInBrowserList(
    FileRef f, {
    void Function(double progress)? onProgress,
  }) =>
      downloadInBrowser(
        f.url,
        name: '${f.fileId}.${_ext(f.mime)}',
        mime: f.mime,
        onProgress: onProgress,
      );

  /// Opens the kept file in the system viewer, no request to the server. One
  /// deleted just now is fetched again; with no app for this kind of file the
  /// system's share sheet still offers one.
  static Future<void> openKept(FileRef f) async {
    final file = await download(f);
    if (file == null) return;
    var result = await openLocalFile(file.path, f.mime);
    if (result == OpenLocalResult.fileGone) {
      await download(f);
      result = await openLocalFile(file.path, f.mime);
    }
    if (result == OpenLocalResult.opened) return;
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: f.mime)]),
    );
  }

  static Future<void> open(
    BuildContext context,
    FileRef f, {
    required String closeLabel,
  }) async {
    if (f.mime.startsWith('image/')) {
      await showPhotoGallery(context, urls: [f.url], closeLabel: closeLabel);
      return;
    }
    // A browser opens the link in a new tab (it shows or saves the file).
    if (kIsWeb) {
      await launchUrl(Uri.parse(f.url), mode: LaunchMode.externalApplication);
      return;
    }
    await openKept(f);
  }
}

/// "Download" → "Open" on a file row. Owner 2026-11-05: a file already on the
/// device says "Open" at once; one deleted meanwhile is fetched again by the
/// tap. On a computer it stays "Download": the browser's own download.
class FileOpenButton extends ConsumerStatefulWidget {
  FileOpenButton({required api.WorkspaceFileDto file, super.key})
      : file = FileRef.of(file);

  const FileOpenButton.ref({required this.file, super.key});

  final FileRef file;

  @override
  ConsumerState<FileOpenButton> createState() => _FileOpenButtonState();
}

class _FileOpenButtonState extends ConsumerState<FileOpenButton> {
  bool? _have = kIsWeb ? false : null;
  bool _busy = false;

  /// 0..1 while downloading, when the size is known.
  double? _progress;

  @override
  void initState() {
    super.initState();
    _check();
  }

  @override
  void didUpdateWidget(FileOpenButton old) {
    super.didUpdateWidget(old);
    // A fresh signed link of the same file changes nothing.
    if (old.file.fileId != widget.file.fileId) _check();
  }

  void _check() {
    final id = widget.file.fileId;
    CaseFileCache.isDownloaded(widget.file).then((v) {
      if (mounted && widget.file.fileId == id) setState(() => _have = v);
    });
  }

  void _showProgress(double p) {
    if (mounted) setState(() => _progress = p);
  }

  Future<void> _tap() async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _progress = null;
    });
    try {
      if (kIsWeb && !widget.file.mime.startsWith('image/')) {
        await CaseFileCache.downloadInBrowserList(
          widget.file,
          onProgress: _showProgress,
        );
        return;
      }
      final first = _have != true;
      await CaseFileCache.download(widget.file, onProgress: _showProgress);
      if (!mounted) return;
      setState(() => _have = true);
      // A first tap downloads; the next opens (images open at once).
      if (!first || widget.file.mime.startsWith('image/')) {
        await CaseFileCache.open(
          context,
          widget.file,
          closeLabel: t.t('common.close'),
        );
      }
    } on DioException catch (e) {
      // The files were cleared meanwhile: nothing went wrong.
      if (mounted && !CancelToken.isCancel(e)) {
        setState(() => _have = false);
        showAppSnackBar(context, t.t('cases.files.downloadFailed'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final have = _have ?? false;
    final label = t.t(have ? 'cases.files.openBtn' : 'cases.files.download');
    return GestureDetector(
      onTap: _tap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: have ? colors.navy : colors.chip,
          borderRadius: BorderRadius.circular(999),
        ),
        child: _busy
            ? Semantics(
                label: label,
                child: SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    value: _progress,
                  ),
                ),
              )
            : Text(
                label,
                style: type.bodySmall.copyWith(
                  fontWeight: FontWeight.w700,
                  color: have ? Colors.white : colors.text,
                ),
              ),
      ),
    );
  }
}
