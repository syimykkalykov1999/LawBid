import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/shared/presentation/file_drop_zone.dart';

/// A picked case file: `name` null = a photo; a video or a document
/// carries its name (the extension decides the type).
typedef CasePickedFile = ({Uint8List bytes, String? name});

/// Video extensions a case accepts (owner 2026-10-19).
const kCaseVideoExtensions = {'mp4', 'mov', 'm4v'};

/// Whether [name] is a video file.
bool isCaseVideoName(String? name) {
  if (name == null) return false;
  final dot = name.lastIndexOf('.');
  return dot >= 0 &&
      kCaseVideoExtensions.contains(name.substring(dot + 1).toLowerCase());
}

/// Owner 2026-10-19: photos and (when [videos]) videos from the gallery for
/// a case, at most [left]. Videos are re-encoded on the phone to at most
/// 720p like in a chat (the original when that is not possible).
Future<List<CasePickedFile>> pickCaseMedia(
  WidgetRef ref, {
  required int left,
  required bool videos,
}) async {
  if (left <= 0) return const [];
  final flags = ref.read(featureFlagsControllerProvider);
  final photo = photoLimitsOf(flags);
  final picked = videos
      ? await ImagePicker().pickMultipleMedia(
          maxWidth: photo.maxPx,
          maxHeight: photo.maxPx,
          imageQuality: photo.quality,
          limit: left > 1 ? left : null,
        )
      : await ImagePicker().pickMultiImage(
          maxWidth: photo.maxPx,
          maxHeight: photo.maxPx,
          imageQuality: photo.quality,
          limit: left > 1 ? left : null,
        );
  final out = <CasePickedFile>[];
  for (final f in picked.take(left)) {
    if (videos && _isVideo(f)) {
      // Owner rows 101/102: the admin's chat/case height.
      final limits = chatVideoLimitsOf(flags);
      final small =
          await ref.read(videoCompressorProvider).compress(f, limits: limits);
      if (small != null) {
        out.add((bytes: await small.readAsBytes(), name: 'video.mp4'));
      } else {
        final ext = _ext(f.name.isNotEmpty ? f.name : f.path);
        out.add(
          (
            bytes: await f.readAsBytes(),
            name: ext == 'mov' ? 'video.mov' : 'video.mp4',
          ),
        );
      }
    } else {
      out.add((bytes: await f.readAsBytes(), name: null));
    }
  }
  return out;
}

/// Files dragged onto the new-case page in the browser, as the Files button
/// takes them: a photo counts without a name, a video and a document with
/// theirs. A format this place has off or a file over its size stays out.
Future<List<CasePickedFile>> droppedCaseFiles(
  List<XFile> dropped,
  PlaceUploadLimits limits,
) async {
  final out = <CasePickedFile>[];
  for (final f in dropped) {
    if (await f.length() > limits.fileBytes) continue;
    final video = limits.allowsVideo && _isVideo(f);
    final photo = !video && isDroppedPhoto(f);
    if (!video && !photo && limits.mimeForName(f.name) == null) continue;
    out.add((bytes: await f.readAsBytes(), name: photo ? null : f.name));
  }
  return out;
}

bool _isVideo(XFile f) {
  if (f.mimeType?.startsWith('video/') ?? false) return true;
  return kCaseVideoExtensions
      .contains(_ext(f.name.isNotEmpty ? f.name : f.path));
}

String _ext(String name) {
  final dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
}
