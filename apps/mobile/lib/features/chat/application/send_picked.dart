import 'dart:async';
import 'dart:typed_data';

import 'package:lawbid/features/chat/application/chat_providers.dart';

/// Owner 2026-10-22 (WhatsApp): what the media preview hands back goes to
/// the persistent upload queue (`core/uploads`) as one album: the files
/// upload together and are sent in the shown order, the one caption rides
/// on the last (the chat groups consecutive attachments into one bubble).
/// Completes when every file is queued.
Future<void> sendPickedFiles(
  ChatThread thread,
  List<({Uint8List bytes, String name, String mime})> files,
  String caption,
) async {
  Future<void>? previous;
  for (var i = 0; i < files.length; i++) {
    final f = files[i];
    final last = i == files.length - 1;
    previous = thread.sendAttachment(
      bytes: f.bytes,
      name: f.name,
      mime: f.mime,
      caption: last && caption.isNotEmpty ? caption : null,
      after: previous,
    );
    unawaited(previous);
  }
  if (previous != null) await previous;
}
