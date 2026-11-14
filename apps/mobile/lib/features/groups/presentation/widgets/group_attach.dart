import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/files/pick_files.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/media/photo_metadata.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show kChatAttachmentMaxBytes, kChatFileExtensions;
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show PickedChatFile;

/// What the «+» menu of the composer offers.
enum GroupAttachChoice { photos, camera, files, poll }

/// The «+» menu: photos, camera, files, poll.
Future<GroupAttachChoice?> showGroupAttachMenu(
  BuildContext context,
  Translator t, {
  bool media = true,
  bool poll = true,
}) =>
    showAppBottomSheet<GroupAttachChoice>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (media) ...[
              AppListRow(
                icon: AppIcons.photoLibraryOutlined,
                label: t.t('chat.attach.photos'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(GroupAttachChoice.photos),
              ),
              AppListRow(
                icon: AppIcons.photoCameraOutlined,
                label: t.t('chat.attach.camera'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(GroupAttachChoice.camera),
              ),
              AppListRow(
                icon: AppIcons.descriptionOutlined,
                label: t.t('chat.attach.files'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(GroupAttachChoice.files),
              ),
            ],
            if (poll)
              AppListRow(
                icon: AppIcons.factCheckOutlined,
                label: t.t('group.conv.attachPoll'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(GroupAttachChoice.poll),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );

/// Picks photos (gallery or camera) or files for a group chat; a file the
/// chat would refuse (type, size) is skipped and reported. Works in the
/// browser (bytes only, no `dart:io`).
Future<List<PickedChatFile>> pickGroupFiles(
  BuildContext context,
  Translator t,
  GroupAttachChoice choice, {
  PlaceUploadLimits? limits,

  /// R-255: documents and videos stay on disk (ignored in the browser, which
  /// has no paths). A caller passes it only if it can send from a path.
  bool fromDisk = false,
}) async {
  final onDisk = fromDisk && !kIsWeb;
  final out = <PickedChatFile>[];
  var skipped = 0;
  final maxBytes = limits?.fileBytes ?? kChatAttachmentMaxBytes;
  String? mimeFor(String name) =>
      limits == null ? chatMimeForName(name) : limits.mimeForName(name);
  void add(List<int> raw, String name) {
    final bytes = raw is Uint8List ? raw : Uint8List.fromList(raw);
    // The real type of a photo from its first bytes (a browser may hand
    // over a name without an extension), when that type is allowed.
    final sniffed = sniffImageMime(bytes);
    final mime =
        sniffed != null && mimeFor('f.${sniffed.split('/').last}') != null
            ? sniffed
            : mimeFor(name);
    if (mime == null || bytes.length > maxBytes) {
      skipped++;
      return;
    }
    out.add(
      (
        bytes: bytes,
        name: name,
        mime: mime,
        path: null,
        diskBytes: null,
      ),
    );
  }

  switch (choice) {
    case GroupAttachChoice.poll:
      return const [];
    case GroupAttachChoice.photos:
      final picked = await ImagePicker().pickMultiImage(
        maxWidth: ClientTuning.chatPhotoMaxPx,
        maxHeight: ClientTuning.chatPhotoMaxPx,
        imageQuality: ClientTuning.chatPhotoQuality,
        requestFullMetadata: false,
      );
      for (final f in picked) {
        if (await f.length() > maxBytes) {
          skipped++;
          continue;
        }
        add(await readPickedPhoto(f), f.name);
      }
    case GroupAttachChoice.camera:
      final f = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: ClientTuning.chatPhotoMaxPx,
        maxHeight: ClientTuning.chatPhotoMaxPx,
        imageQuality: ClientTuning.chatPhotoQuality,
        requestFullMetadata: false,
      );
      if (f != null) add(await readPickedPhoto(f), f.name);
    case GroupAttachChoice.files:
      final result = await FilePicker.pickFiles(
        cancelUploadOnWindowBlur: false,
        type: FileType.custom,
        allowedExtensions: limits?.allExtensions ?? kChatFileExtensions,
        allowMultiple: true,
        withData: !onDisk,
      );
      for (final f in result?.files ?? const <PlatformFile>[]) {
        final path = onDisk ? f.path : null;
        if (path != null) {
          // Checked by name and size only: a picture is read, shrunk like a
          // gallery photo and without its location (audit C7).
          if (mimeFor(f.name)?.startsWith('image/') ?? false) {
            final pic = await cleanPickedPicture(
              await XFile(path).readAsBytes(),
              f.name,
              photos: chatPhotoLimits(),
            );
            add(pic.bytes, pic.name);
            continue;
          }
          final mime = mimeFor(f.name);
          if (mime == null || f.size > maxBytes) {
            skipped++;
            continue;
          }
          out.add(
            (
              bytes: Uint8List(0),
              name: f.name,
              mime: mime,
              path: path,
              diskBytes: f.size,
            ),
          );
          continue;
        }
        final bytes = f.bytes;
        if (bytes == null) {
          skipped++;
          continue;
        }
        add(bytes, f.name);
      }
  }
  if (skipped > 0 && context.mounted) {
    final maxMb = (maxBytes / (1024 * 1024)).round();
    showAppSnackBar(
      context,
      t.t('chat.attach.skipped', {'count': '$skipped', 'max': '$maxMb'}),
    );
  }
  return out;
}
