import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/files/pick_files.dart';
import 'package:lawbid/core/files/picker_web_options.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show kChatAttachmentMaxBytes, kChatFileExtensions;
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show PickedChatFile, isPickedVideo, keepChatPickMax;
import 'package:lawbid/features/chat/presentation/chat_camera.dart';
import 'package:material_ui/material_ui.dart';

/// What the «+» menu of the composer offers.
enum GroupAttachChoice { photos, camera, files, poll }

/// The «+» menu: photos, camera, files, poll.
Future<GroupAttachChoice?> showGroupAttachMenu(
  BuildContext context,
  Translator t, {
  bool media = true,
  bool poll = true,
  // Groups WhatsApp parity: the gallery also offers videos (the 1:1
  // chat's «Gallery» label, chat.attach.gallery).
  bool video = false,
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
                label:
                    t.t(video ? 'chat.attach.gallery' : 'chat.attach.photos'),
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

  /// Groups WhatsApp parity (the 1:1 chat's `pickChatFiles`): set → the
  /// gallery also picks videos (when a video format is on); gets the
  /// picked video, returns it ready to upload (compressed on the phone).
  Future<XFile> Function(XFile video)? prepareVideo,

  /// Owner 26.11 (WhatsApp / Telegram: the bubble shows while the rest is
  /// still being prepared): set → each file goes here the moment it is
  /// ready (in the picked order) instead of all at the end; the list
  /// returned is then empty.
  Future<void> Function(PickedChatFile file)? onEach,
}) async {
  final onDisk = fromDisk && !kIsWeb;
  final videoOn = prepareVideo != null && (limits?.allowsVideo ?? true);
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

  /// Hands the files ready so far to [onEach] (see above).
  Future<void> flush() async {
    if (onEach == null) return;
    while (out.isNotEmpty) {
      await onEach(out.removeAt(0));
    }
  }

  switch (choice) {
    case GroupAttachChoice.poll:
      return const [];
    case GroupAttachChoice.photos:
      // Groups WhatsApp parity: videos picked in the same gallery are
      // compressed and sent too, as in the 1:1 chat (pickChatFiles).
      // Owner 26.11 (Samsung, 51 photos, nothing sent for long): the
      // originals come back (the 1:1 chat's `keepOriginals`): the picker no
      // longer shrinks every photo one by one on its single thread
      // (image_picker_android ImageResizer, the `scaled_…` files) before
      // the app gets the first one. Each is shrunk here, once, and goes to
      // its bubble at once; at most `media.chat_pick_max` per pick.
      final all = videoOn
          ? await ImagePicker().pickMultipleMedia(
              limit: ClientTuning.chatPickMax,
              requestFullMetadata: false,
            )
          : await ImagePicker().pickMultiImage(
              limit: ClientTuning.chatPickMax,
              requestFullMetadata: false,
            );
      if (!context.mounted) return const [];
      final picked = keepChatPickMax(context, t, all);
      for (final f in picked) {
        // One unreadable photo or failed video never stops the others
        // (it is counted in the «not added» line below).
        try {
          final video = videoOn && isPickedVideo(f);
          final size = await f.length();
          // A phone video over the limit may still fit once compressed
          // (the 1:1 rule); in the browser it is refused before it is read.
          // An original photo over the limit is still read (up to the
          // admin's cap) and shrunk, like one from «Files».
          if (video
              ? size > maxBytes && kIsWeb
              : !pickedFileReadable(size, maxBytes, image: true)) {
            skipped++;
            continue;
          }
          if (video) {
            final ready = await prepareVideo(f);
            final name =
                ready.name.contains('.') ? ready.name : '${ready.name}.mp4';
            final mime = mimeFor(name);
            final readySize = await ready.length();
            if (mime == null || readySize > maxBytes) {
              skipped++;
              continue;
            }
            if (onDisk) {
              out.add(
                (
                  bytes: Uint8List(0),
                  name: name,
                  mime: mime,
                  path: ready.path,
                  diskBytes: readySize,
                ),
              );
            } else {
              add(await ready.readAsBytes(), name);
            }
          } else {
            // The 1:1 chat's gallery photo (addOriginal): shrunk to the
            // chat's size and written as the gallery picker wrote it
            // (colour at half size), without its location.
            final pic = await cleanPickedPicture(
              await f.readAsBytes(),
              f.name,
              photos: chatPhotoLimits(),
              chroma420: true,
            );
            add(pic.bytes, pic.name);
          }
        } on Object catch (e) {
          debugPrint('group pick: $e');
          skipped++;
        }
        await flush();
      }
    case GroupAttachChoice.camera:
      // ROUND1 25.11 row 17 (the 1:1 chat's camera): a refused camera
      // explains itself and offers the phone's settings.
      // Owner 26.11: the original, shrunk here once (the 1:1 chat's
      // camera with `keepOriginals`).
      final f = await takeChatPhoto(context, t);
      if (f != null) {
        final pic = await cleanPickedPicture(
          await f.readAsBytes(),
          f.name,
          photos: chatPhotoLimits(),
          chroma420: true,
        );
        add(pic.bytes, pic.name);
      }
    case GroupAttachChoice.files:
      // Row 149 (file_picker 13): a list; files are read only when asked.
      // Web: a big file from iCloud or a HEIC to convert arrives after the
      // window gets focus back; don't drop it (pickerWebOptions).
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: limits?.allExtensions ?? kChatFileExtensions,
        // The stub equals the default; the web build passes other options.
        // ignore: avoid_redundant_argument_values
        webOptions: pickerWebOptions,
      );
      for (final f in picked) {
        // The size the picker reported, else from disk. Unknown, unreadable
        // or over the limit: refused here, before anything is read (a 1-2 GB
        // file on the web is never loaded whole), and one bad file does not
        // stop the others. A picture over the limit is still read (up to the
        // admin's cap) and shrunk below, like WhatsApp / Telegram.
        final image = mimeFor(f.name)?.startsWith('image/') ?? false;
        final int? size;
        try {
          size = f.lengthSync() ?? await f.length();
        } on Object {
          skipped++;
          continue;
        }
        if (size == null || !pickedFileReadable(size, maxBytes, image: image)) {
          skipped++;
          continue;
        }
        final path = onDisk ? f.path : null;
        if (path != null) {
          // Checked by name and size only: a picture is read, shrunk like a
          // gallery photo and without its location (audit C7).
          if (image) {
            final pic = await cleanPickedPicture(
              await XFile(path).readAsBytes(),
              f.name,
              photos: chatPhotoLimits(),
            );
            add(pic.bytes, pic.name);
            continue;
          }
          final mime = mimeFor(f.name);
          if (mime == null || size > maxBytes) {
            skipped++;
            continue;
          }
          out.add(
            (
              bytes: Uint8List(0),
              name: f.name,
              mime: mime,
              path: path,
              diskBytes: size,
            ),
          );
          continue;
        }
        final Uint8List bytes;
        try {
          bytes = await f.readAsBytes();
        } on Object {
          skipped++;
          continue;
        }
        if (image) {
          // Audit C7: shrunk like a gallery photo, without its location.
          final pic = await cleanPickedPicture(
            bytes,
            f.name,
            photos: chatPhotoLimits(),
          );
          add(pic.bytes, pic.name);
        } else {
          add(bytes, f.name);
        }
      }
  }
  await flush();
  if (skipped > 0 && context.mounted) {
    final maxMb = (maxBytes / (1024 * 1024)).round();
    showAppSnackBar(
      context,
      t.t('chat.attach.skipped', {'count': '$skipped', 'max': '$maxMb'}),
    );
  }
  return out;
}
