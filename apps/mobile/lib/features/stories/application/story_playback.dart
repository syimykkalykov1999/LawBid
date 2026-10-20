import 'package:flutter/foundation.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';

/// The clock and the order of one person's stories in the viewer: which
/// story is on screen, how far along it is, auto-advance, pause.
///
/// Photos and text cards run on [advance] (the viewer feeds it frame by
/// frame); a video story is paced by its player through [reportVideo] and
/// [completeCurrent]. Several things can hold playback at once (a finger
/// held down, a sheet, the keyboard) — each under its own key.
class StoryPlayback extends ChangeNotifier {
  StoryPlayback({
    required this.stories,
    int startIndex = 0,
    this.onShown,
    this.onFinished,
    this.onBeforeFirst,
  })  : assert(stories.isNotEmpty, 'nothing to play'),
        _index = startIndex.clamp(0, stories.length - 1) {
    onShown?.call(current);
  }

  final List<Story> stories;

  /// A story came on screen (mark it viewed).
  final ValueChanged<Story>? onShown;

  /// "Next" on the last story.
  final VoidCallback? onFinished;

  /// "Previous" on the first story.
  final VoidCallback? onBeforeFirst;

  int _index;
  int _restarts = 0;
  bool _done = false;
  double _progress = 0;
  final Set<Object> _holds = {};
  final Set<int> _timerVideos = {};

  int get index => _index;

  /// Bumped when the story on screen starts over (its video seeks back).
  int get restarts => _restarts;
  Story get current => stories[_index];

  /// 0..1 of the story on screen.
  double get progress => _progress;
  bool get paused => _holds.isNotEmpty;

  /// The last story ended (reported once through [onFinished]).
  bool get finished => _done;

  /// Progress of story [i] for its bar: done, running, or not yet.
  double barValue(int i) => i < _index ? 1 : (i == _index ? _progress : 0);

  /// A video story runs on its player's clock; everything else (and a
  /// video that could not be played) on the timer.
  bool get timed {
    final s = current;
    final v = s.video;
    if (s.kind != StoryKind.video || v == null || !v.ready) return true;
    return _timerVideos.contains(_index);
  }

  void hold(Object key) {
    if (_holds.add(key)) notifyListeners();
  }

  void release(Object key) {
    if (_holds.remove(key)) notifyListeners();
  }

  /// Timer step; ignored while paused or when a player paces the story.
  void advance(Duration dt) {
    if (paused || !timed || _done) return;
    final len = current.playLength.inMicroseconds;
    if (len <= 0) return;
    _progress += dt.inMicroseconds / len;
    if (_progress >= 1) {
      next();
    } else {
      notifyListeners();
    }
  }

  /// The player's position in the story, 0..1.
  void reportVideo(double value) {
    if (timed) return;
    final v = value.clamp(0, 1).toDouble();
    if ((v - _progress).abs() < 0.002) return;
    _progress = v;
    notifyListeners();
  }

  /// The player cannot play this video: the story runs as a still.
  void videoFailed() {
    if (_timerVideos.add(_index)) {
      _progress = 0;
      notifyListeners();
    }
  }

  /// The video reached its end.
  void completeCurrent() => next();

  void next() {
    if (_index + 1 < stories.length) {
      _index++;
      _progress = 0;
      notifyListeners();
      onShown?.call(current);
    } else if (!_done) {
      _done = true;
      _progress = 1;
      notifyListeners();
      onFinished?.call();
    }
  }

  void previous() {
    _done = false;
    if (_index > 0) {
      _index--;
      _progress = 0;
      notifyListeners();
      onShown?.call(current);
    } else if (_progress > 0.05) {
      _progress = 0;
      _restarts++;
      notifyListeners();
    } else {
      onBeforeFirst?.call();
    }
  }
}
