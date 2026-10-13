import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

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
/// document in the system's "open with" sheet.
class CaseFileCache {
  static Future<File> _target(FileRef f) async {
    final dir = Directory(
      '${(await getApplicationSupportDirectory()).path}/case_files',
    );
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

  static Future<bool> isDownloaded(FileRef f) async =>
      (await _target(f)).existsSync();

  static Future<File> download(FileRef f) async {
    final file = await _target(f);
    if (file.existsSync()) return file;
    final tmp = File('${file.path}.part');
    await Dio().download(f.url, tmp.path);
    await tmp.rename(file.path);
    return file;
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
    final file = await download(f);
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: f.mime)]),
    );
  }
}

/// "Download" → "Open" on a file row.
class FileOpenButton extends ConsumerStatefulWidget {
  FileOpenButton({required api.WorkspaceFileDto file, super.key})
      : file = FileRef.of(file);

  const FileOpenButton.ref({required this.file, super.key});

  final FileRef file;

  @override
  ConsumerState<FileOpenButton> createState() => _FileOpenButtonState();
}

class _FileOpenButtonState extends ConsumerState<FileOpenButton> {
  bool? _have;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    CaseFileCache.isDownloaded(widget.file).then((v) {
      if (mounted) setState(() => _have = v);
    });
  }

  Future<void> _tap() async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final first = _have != true;
      await CaseFileCache.download(widget.file);
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
            ? const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(
                t.t(have ? 'cases.files.openBtn' : 'cases.files.download'),
                style: type.bodySmall.copyWith(
                  fontWeight: FontWeight.w700,
                  color: have ? Colors.white : colors.text,
                ),
              ),
      ),
    );
  }
}
