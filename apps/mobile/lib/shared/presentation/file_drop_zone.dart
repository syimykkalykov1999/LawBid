import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/photo_jpeg.dart';
import 'package:lawbid/core/media/photo_metadata.dart';

/// Lets files be dragged from the computer onto [child], on the website only
/// (flag `web_file_drop`). On a phone this is [child] and nothing else, and
/// the drop plugin is never started there.
class FileDropZone extends ConsumerStatefulWidget {
  const FileDropZone({
    required this.onFiles,
    required this.child,
    this.enabled = true,
    super.key,
  });

  /// The dropped files (folders are left out).
  final ValueChanged<List<XFile>> onFiles;
  final bool enabled;
  final Widget child;

  /// Tests stand in for the browser.
  @visibleForTesting
  static bool debugAssumeWeb = false;

  @override
  ConsumerState<FileDropZone> createState() => _FileDropZoneState();
}

class _FileDropZoneState extends ConsumerState<FileDropZone> {
  bool _over = false;

  void _setOver(bool value) {
    if (_over != value && mounted) setState(() => _over = value);
  }

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb && !FileDropZone.debugAssumeWeb) return widget.child;
    final on = ref.watch(
      featureFlagsControllerProvider.select(
        (f) => f.isEnabled('web_file_drop'),
      ),
    );
    if (!on) return widget.child;
    return DropTarget(
      // The plugin's own note: a route on top must not receive the drop.
      enable: widget.enabled && (ModalRoute.isCurrentOf(context) ?? true),
      onDragEntered: (_) => _setOver(true),
      onDragExited: (_) => _setOver(false),
      onDragDone: (d) {
        _setOver(false);
        final files = [...d.files.whereType<DropItemFile>()];
        if (files.isNotEmpty) widget.onFiles(files);
      },
      child: Stack(
        fit: StackFit.passthrough,
        children: [
          widget.child,
          if (_over)
            const Positioned.fill(child: IgnorePointer(child: _DropHint())),
        ],
      ),
    );
  }
}

class _DropHint extends ConsumerWidget {
  const _DropHint();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return DecoratedBox(
      key: const ValueKey('file-drop-hint'),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.9),
        border: Border.all(color: colors.accent, width: 2),
        borderRadius: BorderRadius.circular(AppRadii.field),
      ),
      child: Center(
        child: Text(
          ref.watch(translatorProvider).t('upload.drop.hint'),
          textAlign: TextAlign.center,
          style: type.body.copyWith(color: colors.text),
        ),
      ),
    );
  }
}

/// Whether a dropped file is a photo, by its type or its name.
bool isDroppedPhoto(XFile f) {
  if (f.mimeType?.startsWith('image/') ?? false) return true;
  final n = f.name.toLowerCase();
  return const ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif']
      .any(n.endsWith);
}

/// A dropped photo at most [maxPx] on its long side. The gallery picker does
/// this for a picked one; a drop arrives as the original from the camera.
/// Media audit 13.11 (R12, C5 / D9): written as a JPEG at [quality] by the
/// browser's own encoder (was PNG on the page's thread, which froze the tab
/// and was several times the bytes), without the photo's location. What
/// cannot be decoded here stays as it is.
Future<Uint8List> shrinkDroppedPhoto(
  Uint8List bytes,
  int maxPx, {
  required int quality,
}) async {
  final out = await shrinkPhotoToJpeg(bytes, maxPx: maxPx, quality: quality);
  return identical(out, bytes) ? stripPhotoMetadataAsync(bytes) : out;
}
