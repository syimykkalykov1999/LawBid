import 'dart:ui' as ui;

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

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
/// What cannot be decoded here stays as it is.
Future<Uint8List> shrinkDroppedPhoto(Uint8List bytes, int maxPx) async {
  if (maxPx <= 0) return bytes;
  try {
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    final descriptor = await ui.ImageDescriptor.encoded(buffer);
    final w = descriptor.width;
    final h = descriptor.height;
    if (w <= maxPx && h <= maxPx) {
      descriptor.dispose();
      buffer.dispose();
      return bytes;
    }
    final codec = await descriptor.instantiateCodec(
      targetWidth: w >= h ? maxPx : null,
      targetHeight: w >= h ? null : maxPx,
    );
    final image = (await codec.getNextFrame()).image;
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    codec.dispose();
    descriptor.dispose();
    buffer.dispose();
    return data == null ? bytes : data.buffer.asUint8List();
  } on Object {
    return bytes;
  }
}
