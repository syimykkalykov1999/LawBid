import 'dart:typed_data';

import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_scratch_mem.dart'
    if (dart.library.io) 'package:lawbid/features/chat/e2ee/e2ee_scratch_io.dart'
    as impl;

/// Where a decrypted chat file is: a file in the app's own cache folder on
/// the phone (read in ranges by the players), or bytes in the browser.
class E2eePlainFile {
  const E2eePlainFile({required this.length, this.path, this.bytes});

  final int length;
  final String? path;
  final Uint8List? bytes;
}

/// Item 25, PR 4: the disk (phone) or memory (browser) an encrypted chat
/// file passes through — segment by segment, so a 100 MB video is never
/// held whole in memory on the phone. Decrypted copies are kept up to
/// [plainBudgetBytes] (least recently used out first, as WhatsApp's media
/// cache) and wiped on sign-out.
abstract class E2eeScratch {
  static E2eeScratch create() => impl.create();

  /// The plaintext budget of the decrypted copies.
  static const plainBudgetBytes = 512 * 1024 * 1024;

  /// Writes [data] where an upload can read it again (a temp file on the
  /// phone); its `release` deletes it.
  Future<({UploadBody body, Future<void> Function() release})> hold(
    Stream<List<int>> data,
  );

  /// Keeps the decrypted copy of [fileId] written from [data] (an error in
  /// the stream leaves nothing behind).
  Future<E2eePlainFile> keep(String fileId, Stream<List<int>> data);

  /// The kept copy of [fileId], or null.
  E2eePlainFile? kept(String fileId);

  /// Deletes the kept copy of [fileId] (it failed its check).
  Future<void> drop(String fileId);

  /// A local plaintext this device already has (the sender's own file).
  void adopt(String fileId, E2eePlainFile file);

  /// Everything goes (sign-out).
  Future<void> clear();
}
