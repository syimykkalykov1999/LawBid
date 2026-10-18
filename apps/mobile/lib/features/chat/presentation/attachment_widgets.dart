// ignore_for_file: lines_longer_than_80_chars
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart'
    show openCaseDocument;
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
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
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
  if (choice == null) return const [];
  final out = <PickedChatFile>[];
  var skipped = 0;
  void add(Uint8List bytes, String name) {
    final mime =
        limits == null ? chatMimeForName(name) : limits.mimeForName(name);
    final maxBytes = limits?.fileBytes ?? kChatAttachmentMaxBytes;
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
    case 'photos':
      // Owner 2026-10-01: no count limit in chats and tasks (only
      // publications keep 9 photos). Owner 2026-10-17: videos picked in
      // the same gallery are compressed and sent too.
      final picked = videoOn
          ? await ImagePicker().pickMultipleMedia(
              maxWidth: 2560,
              maxHeight: 2560,
              imageQuality: 90,
            )
          : await ImagePicker().pickMultiImage(
              maxWidth: 2560,
              maxHeight: 2560,
              imageQuality: 90,
            );
      for (final f in picked) {
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
    showAppSnackBar(context, t.t('chat.attach.skipped', {'count': '$skipped'}));
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
      n.endsWith('.3gp');
}

/// "12.4 MB", "830 KB".
String fileSizeLabel(int? bytes) {
  if (bytes == null) return '';
  if (bytes >= 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(bytes / 1024).ceil()} KB';
}

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
class AttachmentMessageBody extends ConsumerWidget {
  const AttachmentMessageBody({
    required this.message,
    required this.mine,
    super.key,
  });

  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = message.attachment!;
    final sending = message.delivery == DeliveryState.sending;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final pct = a.progress > 0 && a.progress < 1 ? a.progress : null;

    final Widget content;
    if (a.isVideo) {
      // Owner 2026-10-17 (WhatsApp): first frame, play button, length.
      content = ChatVideoTile(
        attachment: a,
        sending: sending,
        playLabel: t.t('chat.attach.videoPlay'),
      );
    } else if (a.isImage) {
      final image = a.localBytes != null
          ? Image.memory(a.localBytes!, fit: BoxFit.cover, cacheWidth: 600)
          : (a.previewUrl ?? a.url) != null
              ? Image(
                  image: appNetworkImage((a.previewUrl ?? a.url)!, 600),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) =>
                      ColoredBox(color: colors.skeletonBase),
                )
              : ColoredBox(color: colors.skeletonBase);
      final ratio = (a.width != null && a.height != null && a.height! > 0)
          ? (a.width! / a.height!).clamp(0.6, 1.8)
          : 4 / 3;
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
            child: SizedBox(
              width: 220,
              child: AspectRatio(
                aspectRatio: ratio,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    image,
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
        ),
      );
    } else {
      final look = docLook(a.extension);
      content = Semantics(
        button: a.url != null,
        label: '${a.name}, ${fileSizeLabel(a.sizeBytes)}',
        excludeSemantics: true,
        child: AppPressable(
          onTap: a.url == null ? () {} : () => openCaseDocument(a.url!),
          child: SizedBox(
            width: 240,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: look.color,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AppIcon(look.icon, size: 20, color: Colors.white),
                          if (a.extension.isNotEmpty)
                            Text(
                              a.extension.toUpperCase(),
                              maxLines: 1,
                              style: type.caption.copyWith(
                                color: Colors.white,
                                fontSize: 8,
                                fontWeight: FontWeight.w700,
                                height: 1,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(
                              color: fg,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            [
                              fileSizeLabel(a.sizeBytes),
                              if (a.extension.isNotEmpty)
                                a.extension.toUpperCase(),
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: type.caption
                                .copyWith(color: fg.withValues(alpha: 0.75)),
                          ),
                        ],
                      ),
                    ),
                    if (a.url != null)
                      AppIcon(
                        AppIcons.openInNewRounded,
                        size: 18,
                        color: fg.withValues(alpha: 0.75),
                      ),
                  ],
                ),
                if (sending)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: LinearProgressIndicator(
                      value: pct,
                      minHeight: 3,
                      color: colors.gold,
                      backgroundColor: fg.withValues(alpha: 0.2),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        content,
        if (message.body.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          SizedBox(
            width: a.isImage ? 220 : 240,
            child: Text(
              message.body,
              style: type.body.copyWith(color: fg, height: 1.35),
            ),
          ),
        ],
      ],
    );
  }
}
