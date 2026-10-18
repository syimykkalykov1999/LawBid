import 'dart:typed_data';

import 'package:flutter/painting.dart' show Size;

/// Off the web the phone's own plugins do this (video_frames.dart).
Future<({int totalMs, Size size})?> probeVideoUrl(String url) async => null;

Future<Uint8List?> videoFrameUrl(
  String url,
  int ms, {
  int quality = 45,
}) async {
  return null;
}
