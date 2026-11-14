import 'dart:async';

/// Owner row 106 (media audit 13.11, batch F item 14): the server pushes
/// `file:ready` over the realtime socket the moment the check of an upload
/// ends (clean, infected or failed). The uploader then asks `GET /files/:id`
/// once, instead of every 700 ms for up to half a minute
/// (`StorageUploader.waitClean`). The realtime client feeds this hub
/// (features/chat/application/realtime_providers.dart); without a connected
/// socket the uploader polls as before.
abstract final class FileReady {
  static final _ready = StreamController<String>.broadcast();

  /// Whether the socket that carries `file:ready` is connected now.
  static bool Function() connected = _never;

  static bool _never() => false;

  /// The server says the check of [fileId] ended.
  static void add(String fileId) {
    if (fileId.isNotEmpty) _ready.add(fileId);
  }

  /// Completes when [fileId] is ready or after [max], whichever is first.
  static Future<void> wait(String fileId, Duration max) {
    final done = Completer<void>();
    late final StreamSubscription<String> sub;
    final timer = Timer(max, () {
      if (!done.isCompleted) done.complete();
    });
    sub = _ready.stream.where((id) => id == fileId).listen((_) {
      if (!done.isCompleted) done.complete();
    });
    return done.future.whenComplete(() {
      timer.cancel();
      unawaited(sub.cancel());
    });
  }

  /// Back to no socket (sign-out, tests).
  static void reset() => connected = _never;
}
