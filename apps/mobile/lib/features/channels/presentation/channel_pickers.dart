import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show ImagePicker, ImageSource;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/media/video_frames.dart';
import 'package:lawbid/features/channels/application/channel_compose.dart';
import 'package:lawbid/features/social/presentation/screens/photo_crop_screen.dart';

/// Picks up to `left` photos from the gallery and frames them (square — a
/// channel post shows its photos at most 1:1). Empty = nothing chosen.
/// Overridden in tests.
typedef ChannelPhotoPicker = Future<List<Uint8List>> Function(
  BuildContext context,
  int left,
);

final channelPhotoPickerProvider = Provider<ChannelPhotoPicker>(
  (ref) => (context, left) async {
    final limits = photoLimitsOf(ref.read(featureFlagsControllerProvider));
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: limits.maxPx,
      maxHeight: limits.maxPx,
      imageQuality: limits.quality,
      // image_picker refuses a limit under 2.
      limit: left > 1 ? left : null,
    );
    final bytes = [
      for (final f in picked.take(left)) await f.readAsBytes(),
    ];
    if (bytes.isEmpty || !context.mounted) return const [];
    final framed = await PhotoCropScreen.open(
      context,
      photos: bytes,
      frame: PhotoFrame.square,
    );
    if (framed == null) return const [];
    return [
      for (var i = 0; i < bytes.length; i++) framed.photos[i] ?? bytes[i],
    ];
  },
);

/// Why a picked video was not taken.
enum ChannelVideoProblem { unreadable, tooLong }

typedef ChannelVideoPick = ({
  ChannelVideoDraft? video,
  ChannelVideoProblem? problem,
});

/// Picks a video from the gallery: its length, size and a first frame.
/// Overridden in tests.
typedef ChannelVideoPicker = Future<ChannelVideoPick?> Function(
  BuildContext context,
  int maxSeconds,
);

final channelVideoPickerProvider = Provider<ChannelVideoPicker>(
  (ref) => (context, maxSeconds) async {
    final file = await ImagePicker().pickVideo(source: ImageSource.gallery);
    if (file == null) return null;
    final info = await probeVideo(file);
    if (info == null) {
      return (video: null, problem: ChannelVideoProblem.unreadable);
    }
    final seconds = (info.totalMs / 1000).ceil();
    if (seconds > maxSeconds) {
      return (video: null, problem: ChannelVideoProblem.tooLong);
    }
    final frame = await videoFrame(file, 0, quality: 60);
    return (
      video: ChannelVideoDraft(
        file: file,
        durationSec: seconds,
        size: await file.length(),
        shortSide: info.size.shortestSide.round(),
        frame: frame,
      ),
      problem: null,
    );
  },
);

/// Picks the channel's picture from the camera or the gallery and frames it
/// as a square; null = cancelled. Overridden in tests.
typedef ChannelAvatarPicker = Future<Uint8List?> Function(
  BuildContext context,
  ImageSource source,
);

final channelAvatarPickerProvider = Provider<ChannelAvatarPicker>(
  (ref) => (context, source) async {
    final limits = avatarLimitsOf(ref.read(featureFlagsControllerProvider));
    final file = await ImagePicker().pickImage(
      source: source,
      maxWidth: limits.maxPx,
      maxHeight: limits.maxPx,
      imageQuality: limits.quality,
    );
    if (file == null || !context.mounted) return null;
    final bytes = await file.readAsBytes();
    if (!context.mounted) return null;
    final framed = await PhotoCropScreen.open(
      context,
      photos: [bytes],
      frame: PhotoFrame.square,
    );
    if (framed == null) return null;
    return framed.photos[0] ?? bytes;
  },
);
