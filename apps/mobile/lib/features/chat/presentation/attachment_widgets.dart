// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/files/pick_files.dart';
import 'package:lawbid/core/files/picker_web_options.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/media/photo_metadata.dart';
import 'package:lawbid/core/text/byte_size.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/image_edit.dart'
    show rememberPhotoOriginal;
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';
import 'package:lawbid/features/chat/presentation/chat_camera.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:lawbid/shared/presentation/file_drop_zone.dart';
import 'package:material_ui/material_ui.dart';

export 'package:lawbid/features/chat/presentation/chat_files_screen.dart'
    show ChatFilesScreen, ChatFilesTab;

/// OQ-047: a file picked for a chat. R-255 (flag `chat_files_from_disk`): a
/// video or document can stay on disk: `path` and `diskBytes` are set and
/// `bytes` is empty, so a long video never sits in the phone's memory.
typedef PickedChatFile = ({
  Uint8List bytes,
  String name,
  String mime,
  String? path,
  int? diskBytes,
});

/// Files dragged onto a chat in the browser, checked like picked ones: type,
/// size (before reading, a long clip could close the tab). What the chat
/// refuses is skipped and reported. Used by one-to-one and group chats.
Future<List<PickedChatFile>> droppedChatFiles(
  BuildContext context,
  Translator t,
  List<XFile> dropped, {
  PlaceUploadLimits? limits,
}) async {
  final out = <PickedChatFile>[];
  var skipped = 0;
  final maxBytes = limits?.fileBytes ?? kChatAttachmentMaxBytes;
  String? mimeFor(String name) =>
      limits == null ? chatMimeForName(name) : limits.mimeForName(name);
  for (final f in dropped) {
    if (mimeFor(f.name) == null && !isDroppedPhoto(f) ||
        await f.length() > maxBytes) {
      skipped++;
      continue;
    }
    final bytes = await f.readAsBytes();
    final sniffed = sniffImageMime(bytes);
    final mime =
        sniffed != null && mimeFor('f.${sniffed.split('/').last}') != null
            ? sniffed
            : mimeFor(f.name);
    if (mime == null) {
      skipped++;
      continue;
    }
    out.add(
      (
        bytes: bytes,
        name: f.name,
        mime: mime,
        path: null,
        diskBytes: null,
      ),
    );
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

/// The paperclip next to the message field: photos, camera or files (every
/// common document format). Files the server would refuse are reported.
Future<List<PickedChatFile>> pickChatFiles(
  BuildContext context,
  Translator t, {
  /// Owner 2026-10-05: shows "Document template"; picked → this runs and
  /// no files are returned.
  VoidCallback? onTemplate,

  /// Owner 2026-10-20: «Contact» (an attorney's card) and «Place» (an
  /// address with «Open in maps»); picked → this runs, no files returned.
  VoidCallback? onContact,
  VoidCallback? onPlace,

  /// Owner 2026-10-07 (bug 17): the admin's formats and MB for this place
  /// (chat or task); without it the chat defaults.
  PlaceUploadLimits? limits,

  /// Owner 2026-10-17: set → "Video" is offered (when a video format is on);
  /// gets the picked video, returns it ready to upload (compressed).
  Future<XFile> Function(XFile video)? prepareVideo,

  /// Owner 2026-10-22 (WhatsApp): the camera button beside the mic skips the
  /// sheet ('camera'); the shot opens in the media preview like the rest.
  String? directChoice,

  /// R-255: videos and documents stay on disk (ignored in the browser, which
  /// has no paths). A caller passes it only if it can send from a path.
  bool fromDisk = false,

  /// Row 199 (WhatsApp / Telegram): the picked photos open in an editor
  /// (the media preview). The gallery and camera then hand over the
  /// original; the chat photo is made from it here, and an edit later is
  /// drawn from the same original, so the photo sent is compressed once.
  bool keepOriginals = false,
}) async {
  final videoOn = prepareVideo != null && (limits?.allowsVideo ?? true);
  final choice = directChoice ??
      await showAppBottomSheet<String>(
        context: context,
        builder: (sheet) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              // Owner 2026-10-17 (WhatsApp): one gallery for photos and videos.
              AppListRow(
                icon: AppIcons.photoLibraryOutlined,
                label:
                    t.t(videoOn ? 'chat.attach.gallery' : 'chat.attach.photos'),
                onTap: () => Navigator.of(sheet).pop('photos'),
              ),
              AppListRow(
                icon: AppIcons.photoCameraOutlined,
                label: t.t('chat.attach.camera'),
                onTap: () => Navigator.of(sheet).pop('camera'),
              ),
              AppListRow(
                icon: AppIcons.descriptionOutlined,
                label: t.t('chat.attach.files'),
                onTap: () => Navigator.of(sheet).pop('files'),
              ),
              if (onTemplate != null)
                AppListRow(
                  icon: AppIcons.descriptionOutlined,
                  label: t.t('chat.attach.template'),
                  onTap: () => Navigator.of(sheet).pop('template'),
                ),
              if (onContact != null)
                AppListRow(
                  icon: AppIcons.person,
                  label: t.t('card.contact'),
                  onTap: () => Navigator.of(sheet).pop('contact'),
                ),
              if (onPlace != null)
                AppListRow(
                  icon: AppIcons.placeOutlined,
                  label: t.t('card.place'),
                  onTap: () => Navigator.of(sheet).pop('place'),
                ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        ),
      );
  if (choice == null) return const [];
  final out = <PickedChatFile>[];
  var skipped = 0;
  String? mimeFor(String name) =>
      limits == null ? chatMimeForName(name) : limits.mimeForName(name);
  final maxBytes = limits?.fileBytes ?? kChatAttachmentMaxBytes;
  void add(Uint8List bytes, String name) {
    // A photo's real type from its first bytes (a browser may hand over a
    // name with no extension, or a «.HEIC» that is already a JPEG), when
    // that type is allowed here; everything else by its name.
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

  final onDisk = fromDisk && !kIsWeb;

  /// Row 199: [bytes], a whole picture, as a chat photo (shrunk and written
  /// once, or only its location dropped when it is already small); how to
  /// read [bytes] again is kept for the preview's edits. [gallery]: written
  /// the way the gallery picker wrote it before (colour at half size, the
  /// phones' own encoders), so a photo is not heavier than it was.
  Future<void> addOriginal(
    Uint8List bytes,
    String name,
    Future<Uint8List> Function() original, {
    bool gallery = false,
  }) async {
    final pic = await cleanPickedPicture(
      bytes,
      name,
      photos: chatPhotoLimits(),
      chroma420: gallery,
    );
    final before = out.length;
    add(pic.bytes, pic.name);
    if (out.length > before) rememberPhotoOriginal(pic.bytes, original);
  }

  // Row 199: what the gallery / camera is asked for. With an editor ahead,
  // the original (the one compression happens here); else the picker
  // shrinks it as before.
  final pickPx = keepOriginals ? null : ClientTuning.chatPhotoMaxPx;
  final pickQuality = keepOriginals ? null : ClientTuning.chatPhotoQuality;

  /// A video or document kept on disk, checked by name and size only.
  Future<void> addPath(String path, String name, int size) async {
    final mime = mimeFor(name);
    if (mime == null || size > maxBytes) {
      skipped++;
      return;
    }
    out.add(
      (
        bytes: Uint8List(0),
        name: name,
        mime: mime,
        path: path,
        diskBytes: size,
      ),
    );
  }

  switch (choice) {
    case 'template':
      onTemplate?.call();
      return const [];
    case 'contact':
      onContact?.call();
      return const [];
    case 'place':
      onPlace?.call();
      return const [];
    case 'photos':
      // Owner 2026-10-01: no count limit in chats and tasks (only
      // publications keep 9 photos); owner 26.11: one pick takes at most
      // `media.chat_pick_max` (30 by default). Owner 2026-10-17: videos
      // picked in the same gallery are compressed and sent too.
      // Owner 2026-10-22 (client economy plan, package I): chat photos go
      // at 1600 px / q82 — a third of the bytes, no visible difference on
      // a phone; the original stays on the device.
      // Owner 26.11 (30 by default): the gallery stops at the
      // admin's `media.chat_pick_max`.
      final all = videoOn
          ? await ImagePicker().pickMultipleMedia(
              maxWidth: pickPx,
              maxHeight: pickPx,
              imageQuality: pickQuality,
              limit: ClientTuning.chatPickMax,
              requestFullMetadata: false,
            )
          : await ImagePicker().pickMultiImage(
              maxWidth: pickPx,
              maxHeight: pickPx,
              imageQuality: pickQuality,
              limit: ClientTuning.chatPickMax,
              requestFullMetadata: false,
            );
      if (!context.mounted) return const [];
      final picked = keepChatPickMax(context, t, all);
      for (final f in picked) {
        // Too big: said at once, never read whole into the page's memory
        // (a long iPhone clip could close a Safari tab). An original photo
        // over the limit is still read (up to the admin's cap) and shrunk,
        // like one from «Files».
        final video = videoOn && isPickedVideo(f);
        final size = await f.length();
        if (keepOriginals && !video
            ? !pickedFileReadable(size, maxBytes, image: true)
            : size > maxBytes && !(video && !kIsWeb)) {
          skipped++;
          continue;
        }
        if (video) {
          final ready = await prepareVideo(f);
          final name =
              ready.name.contains('.') ? ready.name : '${ready.name}.mp4';
          if (onDisk) {
            await addPath(ready.path, name, await ready.length());
          } else {
            add(await ready.readAsBytes(), name);
          }
        } else if (keepOriginals) {
          await addOriginal(
            await f.readAsBytes(),
            f.name,
            f.readAsBytes,
            gallery: true,
          );
        } else {
          add(await readPickedPhoto(f), f.name);
        }
      }
    case 'camera':
      // ROUND1 25.11 row 17: a refused camera explains itself.
      if (!context.mounted) return const [];
      final f = await takeChatPhoto(
        context,
        t,
        maxWidth: pickPx,
        maxHeight: pickPx,
        imageQuality: pickQuality,
      );
      if (f == null) break;
      if (keepOriginals) {
        await addOriginal(
          await f.readAsBytes(),
          f.name,
          f.readAsBytes,
          gallery: true,
        );
      } else {
        add(await readPickedPhoto(f), f.name);
      }
    case 'files':
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
          // A picture opens in the preview for editing, so it is read; it
          // was shrunk or is small. Only other files stay on disk.
          if (image) {
            // Audit C7: shrunk like a gallery photo, without its location;
            // row 199: an edit starts again from this file.
            final file = XFile(path);
            if (keepOriginals) {
              await addOriginal(
                await file.readAsBytes(),
                f.name,
                file.readAsBytes,
              );
              continue;
            }
            final pic = await cleanPickedPicture(
              await file.readAsBytes(),
              f.name,
              photos: chatPhotoLimits(),
            );
            add(pic.bytes, pic.name);
          } else {
            await addPath(path, f.name, size);
          }
          continue;
        }
        final Uint8List bytes;
        try {
          bytes = await f.readAsBytes();
        } on Object {
          skipped++;
          continue;
        }
        if (image && keepOriginals) {
          // Row 199: an edit starts again from these bytes.
          await addOriginal(bytes, f.name, () async => bytes);
        } else if (image) {
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
  if (skipped > 0 && context.mounted) {
    // Owner 2026-10-18: the real limit (admin «Загрузки и файлы»), not 25.
    final maxMb =
        ((limits?.fileBytes ?? kChatAttachmentMaxBytes) / (1024 * 1024))
            .round();
    showAppSnackBar(
      context,
      t.t('chat.attach.skipped', {'count': '$skipped', 'max': '$maxMb'}),
    );
  }
  return out;
}

/// A picked gallery item that is a video (by type, else by extension).
/// Group chats pick the same way (pickGroupFiles).
bool isPickedVideo(XFile f) {
  if (f.mimeType?.startsWith('video/') ?? false) return true;
  final n = (f.name.isNotEmpty ? f.name : f.path).toLowerCase();
  return n.endsWith('.mp4') ||
      n.endsWith('.mov') ||
      n.endsWith('.m4v') ||
      n.endsWith('.3gp') ||
      n.endsWith('.webm');
}

/// "12.4 MB", "830 KB" (core/text/byte_size.dart).
String fileSizeLabel(int? bytes) => byteSizeLabel(bytes);

/// A document's colour and icon by its type.
({IconData icon, Color color}) docLook(String ext) => switch (ext) {
      'pdf' => (
          icon: AppIcons.pictureAsPdfRounded,
          color: const Color(0xFFC62828)
        ),
      'doc' || 'docx' || 'odt' || 'rtf' => (
          icon: AppIcons.descriptionRounded,
          color: const Color(0xFF1E5AA8)
        ),
      'xls' || 'xlsx' || 'ods' || 'csv' => (
          icon: AppIcons.tableChartRounded,
          color: const Color(0xFF1E7B45)
        ),
      'ppt' || 'pptx' || 'odp' => (
          icon: AppIcons.slideshowRounded,
          color: const Color(0xFFC75B12)
        ),
      _ => (
          icon: AppIcons.insertDriveFileRounded,
          color: const Color(0xFF5B6478)
        ),
    };

/// Owner 26.11 (group chat on a Samsung: 51 photos picked, nothing sent;
/// 30 by default, owner 26.11): a chat's gallery stops at
/// [ClientTuning.chatPickMax] (`media.chat_pick_max`; the phone's own picker
/// says so). A picker that still hands over more (the browser) keeps the
/// first ones and the chat says why.
List<T> keepChatPickMax<T>(BuildContext context, Translator t, List<T> picked) {
  final max = ClientTuning.chatPickMax;
  if (picked.length <= max) return picked;
  showAppSnackBar(context, t.t('chat.attach.pickMax', {'max': '$max'}));
  return picked.sublist(0, max);
}

/// OQ-047: the inside of an attachment bubble — a photo (tap → full
/// screen) or a document card (tap → the phone's viewer), the upload
/// progress while sending, and the caption under it.
///
/// Owner 2026-10-19 (Telegram): a photo keeps its shape inside about two
/// thirds of the chat's width and ~320 tall (cover-cropped beyond that),
/// sharp at the screen's pixel ratio ([ChatPhoto]).
class AttachmentMessageBody extends ConsumerWidget {
  const AttachmentMessageBody({
    required this.message,
    required this.mine,
    this.captionPadding = EdgeInsets.zero,
    this.onCancel,
    super.key,
  });

  final ChatMessage message;
  final bool mine;

  /// Tapping the ring while it uploads. Null: the 1:1 chat's own (the send
  /// stops and the message goes); a group passes its queue's discard.
  final VoidCallback? onCancel;

  /// Owner 2026-10-22: the text inset of the caption when the photo fills
  /// the bubble edge to edge (Instagram / WhatsApp).
  final EdgeInsetsGeometry captionPadding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = message.attachment!;
    final sending = message.delivery == DeliveryState.sending;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final pct = a.progress > 0 && a.progress < 1 ? a.progress : null;
    // Tap the ring while it uploads: the send stops and the message goes.
    final cancel = sending && mine && onCancel != null
        ? onCancel
        : sending && mine
            ? () => unawaited(
                  ref
                      .read(chatThreadProvider(message.conversationId).notifier)
                      .discard(message),
                )
            : null;

    final Widget content;
    var captionWidth = 240.0;
    if (a.removed) {
      content = ChatRemovedFileRow(fg: fg);
    } else if (a.isVideo) {
      // Owner 2026-10-17 (WhatsApp): first frame, play button, length.
      final box = chatMediaBox(context, a);
      content = ChatVideoTile(
        attachment: a,
        sending: sending,
        playLabel: t.t('chat.attach.videoPlay'),
        box: box,
        onCancel: cancel,
      );
      captionWidth = box.width;
    } else if (a.isImage) {
      final box = chatMediaBox(context, a);
      captionWidth = box.width;
      content = Semantics(
        button: a.url != null,
        image: true,
        label: t.t('chat.attach.photo'),
        child: AppPressable(
          onTap: a.url == null
              ? () {}
              : () => showPhotoGallery(
                    context,
                    urls: [a.url!],
                    closeLabel: t.t('common.close'),
                  ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox.fromSize(
              size: box,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Owner row 88: the full-screen photo grows out of it.
                  GalleryHero(
                    url: a.url ?? '',
                    child: ChatPhoto(attachment: a, size: box),
                  ),
                  // Owner 24.11 (Telegram): the ring only while the bytes go
                  // up; then the photo shows plain with the clock until the
                  // server took the message.
                  if (sending && a.progress < 1)
                    ColoredBox(
                      color: Colors.black26,
                      child: Center(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: cancel,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              SizedBox.square(
                                dimension: 32,
                                child: CircularProgressIndicator(
                                  value: pct,
                                  strokeWidth: 3,
                                  color: Colors.white,
                                ),
                              ),
                              const AppIcon(
                                AppIcons.closeRounded,
                                size: 14,
                                color: Colors.white,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    } else {
      content = ChatDocumentRow(attachment: a, fg: fg, sending: sending);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        content,
        if (message.body.trim().isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          SizedBox(
            width: captionWidth,
            child: Padding(
              padding: captionPadding,
              child: Text(
                message.body,
                style: type.body.copyWith(color: fg, height: 1.35),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// M3 (owner 25.11, Slack / Telegram): the antivirus refused the file (or it
/// is gone) — the same quiet line as a deleted message, for everyone, in
/// 1:1, case and group chats.
class ChatRemovedFileRow extends ConsumerWidget {
  const ChatRemovedFileRow({required this.fg, super.key});

  final Color fg;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final color = fg.withValues(alpha: 0.7);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIcon(AppIcons.blockRounded, size: 15, color: color),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            t.t('chat.attach.removed'),
            style: type.body.copyWith(
              color: color,
              fontStyle: FontStyle.italic,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}
