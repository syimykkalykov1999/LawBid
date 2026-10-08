import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Where a background publish is.
enum UploadStatus { uploading, done, failed }

/// Reports how far a publish is, 0..1.
typedef UploadProgress = void Function(double progress);

/// The whole publish of one post or reel: uploads what it carries, then
/// creates the post. Runs again on «Повторить», so it keeps (in the
/// draft it closes over) whatever already went through.
typedef UploadRun = Future<Post> Function(Ref ref, UploadProgress progress);

/// Owner 2026-10-08: one post or reel being published in the background,
/// shown as the strip at the top of the feed.
@immutable
class UploadTask {
  const UploadTask({
    required this.id,
    this.thumbnail,
    this.video = false,
    this.status = UploadStatus.uploading,
    this.progress = 0,
    this.post,
    this.error,
  });

  final String id;

  /// The photo or the reel's cover; null = the generic glyph.
  final Uint8List? thumbnail;
  final bool video;
  final UploadStatus status;
  final double progress;

  /// The published post (status done).
  final Post? post;
  final Object? error;

  UploadTask copyWith({
    UploadStatus? status,
    double? progress,
    Post? post,
    Object? error,
    bool clearError = false,
  }) =>
      UploadTask(
        id: id,
        thumbnail: thumbnail,
        video: video,
        status: status ?? this.status,
        progress: progress ?? this.progress,
        post: post ?? this.post,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Owner 2026-10-08 (like Instagram): «Опубликовать» closes the composer
/// at once; the post or reel uploads here while the app stays usable. The
/// feed shows each task as a strip — progress, then «Опубликовано ✓»
/// (tap opens the post), or «Повторить» after an error (the draft stays
/// until it is published or dismissed). One queue for posts and reels.
class UploadQueue extends Notifier<List<UploadTask>> {
  /// How long «Опубликовано» stays before the strip goes.
  static const doneVisibleFor = Duration(seconds: 4);

  final _runs = <String, UploadRun>{};
  final _timers = <String, Timer>{};
  var _seq = 0;

  @override
  List<UploadTask> build() {
    ref.onDispose(() {
      for (final t in _timers.values) {
        t.cancel();
      }
      _timers.clear();
    });
    return const [];
  }

  /// Starts publishing; returns the task id.
  String add(UploadRun run, {Uint8List? thumbnail, bool video = false}) {
    final id = 'upload-${++_seq}';
    _runs[id] = run;
    state = [
      ...state,
      UploadTask(id: id, thumbnail: thumbnail, video: video),
    ];
    unawaited(_start(id));
    return id;
  }

  /// «Повторить»: the same draft again.
  void retry(String id) {
    final task = _task(id);
    if (task == null || task.status != UploadStatus.failed) return;
    _set(
      id,
      (t) => t.copyWith(
        status: UploadStatus.uploading,
        progress: 0,
        clearError: true,
      ),
    );
    unawaited(_start(id));
  }

  /// Removes the strip (a failed draft is dropped with it).
  void dismiss(String id) {
    _timers.remove(id)?.cancel();
    _runs.remove(id);
    state = [
      for (final t in state)
        if (t.id != id) t,
    ];
  }

  Future<void> _start(String id) async {
    final run = _runs[id];
    if (run == null) return;
    try {
      final post = await run(ref, (p) {
        final task = _task(id);
        if (task == null || task.status != UploadStatus.uploading) return;
        final next = p.clamp(0.0, 1.0);
        // Never backwards: the bar only grows.
        if (next > task.progress) _set(id, (t) => t.copyWith(progress: next));
      });
      if (_task(id) == null) return;
      _runs.remove(id);
      _set(
        id,
        (t) => t.copyWith(status: UploadStatus.done, progress: 1, post: post),
      );
      _timers[id] = Timer(doneVisibleFor, () {
        _timers.remove(id);
        dismiss(id);
      });
    } on Object catch (e) {
      if (_task(id) == null) return;
      _set(id, (t) => t.copyWith(status: UploadStatus.failed, error: e));
    }
  }

  UploadTask? _task(String id) {
    for (final t in state) {
      if (t.id == id) return t;
    }
    return null;
  }

  void _set(String id, UploadTask Function(UploadTask) change) {
    state = [
      for (final t in state)
        if (t.id == id) change(t) else t,
    ];
  }
}

final uploadQueueProvider =
    NotifierProvider<UploadQueue, List<UploadTask>>(UploadQueue.new);

/// Weighs the steps of one publish into one 0..1 bar: a weight per step
/// (e.g. photos, video, the post itself).
class StepProgress {
  StepProgress(this._report, List<double> weights)
      : _weights = weights,
        _total = weights.fold(0, (a, b) => a + b);

  final UploadProgress _report;
  final List<double> _weights;
  final double _total;

  /// Step [index] is [p] (0..1) done.
  void step(int index, double p) {
    if (_total <= 0) return;
    var done = 0.0;
    for (var i = 0; i < index; i++) {
      done += _weights[i];
    }
    _report((done + _weights[index] * p.clamp(0.0, 1.0)) / _total);
  }
}
