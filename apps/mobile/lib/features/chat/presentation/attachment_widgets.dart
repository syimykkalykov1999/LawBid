// ignore_for_file: lines_longer_than_80_chars
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/text/byte_size.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';

export 'package:lawbid/features/chat/presentation/chat_files_screen.dart'
    show ChatFilesScreen, ChatFilesTab;

/// OQ-047: a file picked for a chat.
typedef PickedChatFile = ({Uint8List bytes, String name, String mime});

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
}) async {
  final videoOn = prepareVideo != null && (limits?.allowsVideo ?? true);
  final choice = await showAppBottomSheet<String>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          // Owner 2026-10-17 (WhatsApp): one gallery for photos and videos.
          AppListRow(
            icon: AppIcons.photoLibraryOutlined,
            label: t.t(videoOn ? 'chat.attach.gallery' : 'chat.attach.photos'),
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
    out.add((bytes: bytes, name: name, mime: mime));
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
      // publications keep 9 photos). Owner 2026-10-17: videos picked in
      // the same gallery are compressed and sent too.
      // Owner 2026-10-22 (client economy plan, package I): chat photos go
      // at 1600 px / q82 — a third of the bytes, no visible difference on
      // a phone; the original stays on the device.
      final picked = videoOn
          ? await ImagePicker().pickMultipleMedia(
              maxWidth: kChatPhotoMaxPx,
              maxHeight: kChatPhotoMaxPx,
              imageQuality: kChatPhotoQuality,
            )
          : await ImagePicker().pickMultiImage(
              maxWidth: kChatPhotoMaxPx,
              maxHeight: kChatPhotoMaxPx,
              imageQuality: kChatPhotoQuality,
            );
      for (final f in picked) {
        // Too big: said at once, never read whole into the page's memory
        // (a long iPhone clip could close a Safari tab).
        if (await f.length() > maxBytes &&
            !(videoOn && _isVideo(f) && !kIsWeb)) {
          skipped++;
          continue;
        }
        if (videoOn && _isVideo(f)) {
          final ready = await prepareVideo(f);
          final name =
              ready.name.contains('.') ? ready.name : '${ready.name}.mp4';
          add(await ready.readAsBytes(), name);
        } else {
          add(await f.readAsBytes(), f.name);
        }
      }
    case 'camera':
      final f = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: 2560,
        maxHeight: 2560,
        imageQuality: 90,
      );
      if (f != null) add(await f.readAsBytes(), f.name);
    case 'files':
      final result = await FilePicker.pickFiles(
        // Web: a big file from iCloud or a HEIC to convert arrives after the
        // window gets focus back; don't drop it.
        cancelUploadOnWindowBlur: false,
        type: FileType.custom,
        allowedExtensions: limits?.allExtensions ?? kChatFileExtensions,
        allowMultiple: true,
        withData: true,
      );
      for (final f in result?.files ?? const <PlatformFile>[]) {
        if (f.bytes == null) {
          skipped++;
          continue;
        }
        add(f.bytes!, f.name);
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
bool _isVideo(XFile f) {
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
    super.key,
  });

  final ChatMessage message;
  final bool mine;

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

    final Widget content;
    var captionWidth = 240.0;
    if (a.isVideo) {
      // Owner 2026-10-17 (WhatsApp): first frame, play button, length.
      final box = chatMediaBox(context, a);
      content = ChatVideoTile(
        attachment: a,
        sending: sending,
        playLabel: t.t('chat.attach.videoPlay'),
        box: box,
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
                  ChatPhoto(attachment: a, size: box),
                  if (sending)
                    ColoredBox(
                      color: Colors.black26,
                      child: Center(
                        child: SizedBox.square(
                          dimension: 32,
                          child: CircularProgressIndicator(
                            value: pct,
                            strokeWidth: 3,
                            color: Colors.white,
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
