import 'package:lawbid/features/chat/e2ee/e2ee_scratch.dart';

/// The browser has no loopback server (E2eeMedia uses `blob:` URLs).
String? get base => null;

Future<void> start(
  Future<({E2eePlainFile file, String mime})?> Function(String fileId)?
          Function()
      resolver,
) async {}
