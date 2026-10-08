import 'package:flutter/foundation.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// One photo of a post or a reel being written. It starts uploading as
/// soon as it is picked; owner 2026-10-08: the composer may close before
/// it is done — the upload queue then waits for the same upload (never a
/// second one) and retries it after an error.
class ComposerPhoto extends ChangeNotifier {
  ComposerPhoto(this.bytes);

  final Uint8List bytes;
  final key = UniqueKey();
  double progress = 0;
  String? fileId;
  Object? error;
  Future<String>? _running;

  bool get uploading => fileId == null && error == null;

  /// The file id: at once when uploaded, else this photo's upload (the
  /// one in flight, or a new one after an error).
  Future<String> upload(SocialActions actions) {
    final id = fileId;
    if (id != null) return SynchronousFuture(id);
    return _running ??= _run(actions);
  }

  Future<String> _run(SocialActions actions) async {
    error = null;
    progress = 0;
    notifyListeners();
    try {
      final id = await actions.uploadPhoto(
        bytes,
        onProgress: (p) {
          progress = p;
          notifyListeners();
        },
      );
      fileId = id;
      return id;
    } on Object catch (e) {
      error = e;
      rethrow;
    } finally {
      _running = null;
      notifyListeners();
    }
  }
}
