import 'package:flutter/widgets.dart';
import 'package:image_picker/image_picker.dart' show XFile;

/// Row 185: a GIF, sticker or picture the phone keyboard inserts into a chat
/// field (Gboard, Samsung Keyboard, SwiftKey — Android's «rich content»,
/// Flutter's own [ContentInsertionConfiguration]) comes in as a file and goes
/// down the same road as a dropped or picked one: preview, compression,
/// direct upload. Null [onFiles] (no right to send files here) leaves the
/// field as it was, so the keyboard does not offer pictures at all.
ContentInsertionConfiguration? keyboardMediaInsertion(
  ValueChanged<List<XFile>>? onFiles,
) {
  if (onFiles == null) return null;
  return ContentInsertionConfiguration(
    // Flutter's list: png, bmp, jpg, tiff, gif, jpeg, webp.
    onContentInserted: (content) {
      final file = keyboardInsertedFile(content);
      if (file != null) onFiles([file]);
    },
  );
}

/// The inserted picture as a file named by its type (`keyboard.gif`), or
/// null when the keyboard sent no bytes.
@visibleForTesting
XFile? keyboardInsertedFile(KeyboardInsertedContent content) {
  final data = content.data;
  if (data == null || data.isEmpty) return null;
  final mime = content.mimeType.toLowerCase();
  final ext = switch (mime.split('/').last) {
    'jpeg' || 'jpg' => 'jpg',
    final other => other,
  };
  final name = 'keyboard.$ext';
  // The name is read from the path on a phone (no file is written).
  return XFile.fromData(
    data,
    name: name,
    path: name,
    mimeType: mime,
    length: data.length,
  );
}
