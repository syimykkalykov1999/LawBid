import 'dart:typed_data';

/// The browser has no loopback server (E2eeMedia uses `blob:` URLs).
String? get base => null;

Future<void> start(
  Future<({Uint8List bytes, String mime})?> Function(String fileId)? Function()
      resolver,
) async {}
