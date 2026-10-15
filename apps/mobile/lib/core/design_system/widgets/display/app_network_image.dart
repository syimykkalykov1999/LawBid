import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';

/// A network picture for avatars and list thumbnails (owner 2026-10-15,
/// "the app flies, costs less"): kept on the phone's disk after the first
/// download (no second download of the same avatar on every list or app
/// start) and decoded at [decodeWidth] pixels instead of full size (a 4000 px
/// photo in a 40 px avatar costs ~60 MB of memory otherwise). Pass about
/// three times the logical size for sharp pictures on dense screens.
ImageProvider appNetworkImage(String url, int decodeWidth) =>
    ResizeImage.resizeIfNeeded(
      decodeWidth,
      null,
      CachedNetworkImageProvider(url),
    );

/// Decode width for a square avatar/thumbnail of [logicalSize] points.
int decodeWidthFor(double logicalSize) => (logicalSize * 3).round();
