import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/core/text/byte_size.dart';
import 'package:lawbid/features/chat/application/image_edit.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show PickedChatFile;
import 'package:lawbid/features/chat/presentation/image_crop_screen.dart';

/// What the preview hands back: the files in the order shown (edited ones
/// replaced) and the one caption.
typedef MediaPreviewResult = ({List<PickedChatFile> files, String caption});

/// Owner 2026-10-22 (WhatsApp): a photo / video / file picked for a chat is
/// NOT sent at once. A full-screen preview opens: a big picture, a strip of
/// thumbnails when several were picked (swipe or tap to switch, remove one),
/// rotate and crop for photos, one caption field and a round send button
/// with the count. Returns null when the person backs out.
///
/// WhatsApp does the same for the camera: the shot opens in this preview.
Future<MediaPreviewResult?> showMediaPreview(
  BuildContext context, {
  required List<PickedChatFile> files,
  String caption = '',
}) =>
    Navigator.of(context, rootNavigator: true).push<MediaPreviewResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => MediaPreviewScreen(files: files, caption: caption),
      ),
    );

class MediaPreviewScreen extends ConsumerStatefulWidget {
  const MediaPreviewScreen({
    required this.files,
    this.caption = '',
    super.key,
  });

  final List<PickedChatFile> files;
  final String caption;

  @override
  ConsumerState<MediaPreviewScreen> createState() => _MediaPreviewScreenState();
}

class _MediaPreviewScreenState extends ConsumerState<MediaPreviewScreen> {
  late List<PickedChatFile> _files = [...widget.files];
  late final TextEditingController _caption =
      TextEditingController(text: widget.caption);
  final _page = PageController();
  int _index = 0;
  bool _busy = false;

  @override
  void dispose() {
    _caption.dispose();
    _page.dispose();
    super.dispose();
  }

  PickedChatFile get _current => _files[_index];
  bool _isImage(PickedChatFile f) => f.mime.startsWith('image/');

  void _remove() {
    if (_files.length <= 1) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _files = [..._files]..removeAt(_index);
      if (_index >= _files.length) _index = _files.length - 1;
    });
    _page.jumpToPage(_index);
  }

  void _replace(Uint8List bytes) {
    final f = _current;
    setState(() {
      _files = [
        for (var i = 0; i < _files.length; i++)
          if (i == _index)
            (bytes: bytes, name: editedName(f.name), mime: 'image/jpeg')
          else
            _files[i],
      ];
    });
  }

  Future<void> _edit(ImageEdit edit) async {
    if (_busy || edit.isIdentity) return;
    setState(() => _busy = true);
    try {
      _replace(await applyImageEdit(_current.bytes, edit));
    } on Object {
      // The picture stays as it was.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _crop() async {
    final edit = await Navigator.of(context).push<ImageEdit>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => ImageCropScreen(bytes: _current.bytes),
      ),
    );
    if (edit != null && mounted) await _edit(edit);
  }

  void _send() {
    if (_busy) return;
    Navigator.of(context).pop<MediaPreviewResult>(
      (files: _files, caption: _caption.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final image = _isImage(_current);
    return Scaffold(
      backgroundColor: ChatColors.viewerBg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Row(
                children: [
                  ViewerButton(
                    icon: AppIcons.closeRounded,
                    label: t.t('common.cancel'),
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  if (image) ...[
                    ViewerButton(
                      key: const ValueKey('preview-rotate'),
                      icon: AppIcons.rotateRightRounded,
                      label: t.t('chat.preview.rotate'),
                      onTap: _busy
                          ? null
                          : () => unawaited(_edit(const ImageEdit().turned())),
                    ),
                    ViewerButton(
                      key: const ValueKey('preview-crop'),
                      icon: AppIcons.cropRounded,
                      label: t.t('chat.preview.crop'),
                      onTap: _busy ? null : () => unawaited(_crop()),
                    ),
                  ],
                  if (_files.length > 1)
                    ViewerButton(
                      key: const ValueKey('preview-remove'),
                      icon: AppIcons.deleteOutlineRounded,
                      label: t.t('common.remove'),
                      onTap: _remove,
                    ),
                ],
              ),
            ),
            Expanded(
              child: Stack(
                children: [
                  PageView.builder(
                    key: const ValueKey('preview-pages'),
                    controller: _page,
                    itemCount: _files.length,
                    onPageChanged: (i) => setState(() => _index = i),
                    itemBuilder: (context, i) => _Stage(file: _files[i]),
                  ),
                  if (_busy)
                    const Center(
                      child: CircularProgressIndicator(
                        color: ChatColors.onViewer,
                      ),
                    ),
                ],
              ),
            ),
            if (_files.length > 1)
              SizedBox(
                height: 62,
                child: ListView.separated(
                  key: const ValueKey('preview-strip'),
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  itemCount: _files.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 6),
                  itemBuilder: (context, i) => _Thumb(
                    file: _files[i],
                    selected: i == _index,
                    onTap: () => unawaited(
                      _page.animateToPage(
                        i,
                        duration: const Duration(milliseconds: 200),
                        curve: Curves.easeOut,
                      ),
                    ),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: ChatColors.viewerBar,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: TextField(
                        key: const ValueKey('preview-caption'),
                        controller: _caption,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: TextLimits.of(TextLimit.chatMessage),
                        buildCounter: (
                          _, {
                          required currentLength,
                          required isFocused,
                          maxLength,
                        }) =>
                            null,
                        textInputAction: TextInputAction.newline,
                        style: type.body.copyWith(color: ChatColors.onViewer),
                        cursorColor: ChatColors.onViewer,
                        decoration: InputDecoration(
                          border: InputBorder.none,
                          hintText: t.t('chat.preview.caption'),
                          hintStyle: type.body.copyWith(
                            color: ChatColors.onViewerMuted,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Semantics(
                    button: true,
                    label: t.t('chat.forward.send'),
                    child: GestureDetector(
                      key: const ValueKey('preview-send'),
                      onTap: _send,
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Theme.of(context)
                              .extension<AppColorTokens>()!
                              .gold,
                        ),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            AppIcon(
                              AppIcons.sendRounded,
                              color: Theme.of(context)
                                  .extension<AppColorTokens>()!
                                  .onAccent,
                            ),
                            if (_files.length > 1)
                              PositionedDirectional(
                                top: -4,
                                end: -4,
                                child: Container(
                                  key: const ValueKey('preview-count'),
                                  constraints:
                                      const BoxConstraints(minWidth: 20),
                                  height: 20,
                                  alignment: Alignment.center,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: ChatColors.onViewer,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    ref
                                        .watch(l10nFormatsProvider)
                                        .digits(_files.length),
                                    style: type.caption.copyWith(
                                      color: ChatColors.viewerBg,
                                      fontWeight: FontWeight.w700,
                                      height: 1,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The big preview of one file.
class _Stage extends StatelessWidget {
  const _Stage({required this.file});

  final PickedChatFile file;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (file.mime.startsWith('image/')) {
      return InteractiveViewer(
        maxScale: 4,
        child: Center(child: Image.memory(file.bytes, fit: BoxFit.contain)),
      );
    }
    final video = file.mime.startsWith('video/');
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppIcon(
            video
                ? AppIcons.playCircleRounded
                : AppIcons.insertDriveFileRounded,
            size: 72,
            color: ChatColors.onViewer,
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              file.name,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: ChatColors.onViewer),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            byteSizeLabel(file.bytes.length),
            style: type.caption.copyWith(color: ChatColors.onViewerMuted),
          ),
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({
    required this.file,
    required this.selected,
    required this.onTap,
  });

  final PickedChatFile file;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final image = file.mime.startsWith('image/');
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        width: 54,
        height: 54,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? ChatColors.onViewer : ChatColors.clear,
            width: 2,
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: image
              ? Image.memory(
                  file.bytes,
                  fit: BoxFit.cover,
                  cacheWidth: 160,
                )
              : ColoredBox(
                  color: ChatColors.viewerBar,
                  child: Center(
                    child: AppIcon(
                      file.mime.startsWith('video/')
                          ? AppIcons.playArrowRounded
                          : AppIcons.insertDriveFileRounded,
                      color: ChatColors.onViewer,
                      size: 24,
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}
