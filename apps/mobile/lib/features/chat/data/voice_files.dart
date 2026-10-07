import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// OQ-040: the recorded note on the device (the recorder writes it into
/// the app's temp directory; it is removed once sent or discarded). In a
/// browser [path] is the recorder's blob: URL, read with a plain request.
Future<Uint8List> readVoiceFile(String path) async {
  if (!kIsWeb) return File(path).readAsBytes();
  final res = await Dio().get<List<int>>(
    path,
    options: Options(responseType: ResponseType.bytes),
  );
  return Uint8List.fromList(res.data ?? const []);
}

Future<void> deleteVoiceFile(String? path) async {
  // Web: the blob lives until the tab closes.
  if (path == null || kIsWeb) return;
  try {
    await File(path).delete();
  } on Object {
    // Already gone.
  }
}
