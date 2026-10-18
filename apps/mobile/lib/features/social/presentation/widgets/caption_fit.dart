import 'package:flutter/painting.dart';

/// Owner 2026-10-18 (speed): caption measuring for the feed cards.
///
/// The captions used to find their «… ещё» cut with a binary search of
/// full-text [TextPainter] layouts on every build (a long post = a dozen
/// layouts of the whole text per card per frame of a scroll). These
/// helpers give the same answers cheaply:
/// - only the first [kCaptionMeasureChars] characters are laid out when
///   that already decides the question (two or three lines never hold
///   more);
/// - the cut is still found by the same binary search (a guess read off
///   one layout with getPositionForOffset and backed off from there was
///   tried, but where a long word wraps differently once cut it can land
///   a few characters away from the old cut — the owner wants the same
///   text), only each probe is now that cheap start-only layout;
/// - answers are cached by (text, width, text scale, style, …) so a
///   rebuild of the same card measures nothing;
/// - every [TextPainter] is disposed.
const int kCaptionMeasureChars = 600;

final Map<Object, Object?> _cache = <Object, Object?>{};
const int _cacheSize = 400;

/// [compute]'s answer for [key], remembered (least recently used dropped).
T cachedCaptionFit<T>(Object key, T Function() compute) {
  _watchFonts();
  if (_cache.containsKey(key)) {
    final hit = _cache.remove(key);
    _cache[key] = hit;
    return hit as T;
  }
  final value = compute();
  _cache[key] = value;
  if (_cache.length > _cacheSize) _cache.remove(_cache.keys.first);
  return value;
}

bool _watchingFonts = false;

/// A font that finishes loading later (web) changes every measurement:
/// the remembered answers are dropped then, as the old per-build
/// measuring would have re-measured.
void _watchFonts() {
  if (_watchingFonts) return;
  _watchingFonts = true;
  PaintingBinding.instance.systemFonts.addListener(_cache.clear);
}

/// Where a prefix of at most [max] code units of [text] may end without
/// splitting a surrogate pair.
int _prefixEnd(String text, int max) {
  if (text.length <= max) return text.length;
  final unit = text.codeUnitAt(max - 1);
  // A high surrogate at the end would be half a character.
  return unit >= 0xD800 && unit <= 0xDBFF ? max - 1 : max;
}

TextPainter _layout(
  String text,
  TextStyle style,
  double width,
  TextDirection direction,
  TextScaler scaler, {
  int? maxLines,
}) =>
    TextPainter(
      text: TextSpan(text: text, style: style),
      maxLines: maxLines,
      textDirection: direction,
      textScaler: scaler,
    )..layout(maxWidth: width);

bool _exceeds(
  String text,
  TextStyle style,
  double width,
  int maxLines,
  TextDirection direction,
  TextScaler scaler,
) {
  final p = _layout(text, style, width, direction, scaler, maxLines: maxLines);
  final result = p.didExceedMaxLines;
  p.dispose();
  return result;
}

/// Whether [text] needs more than [maxLines] lines at [width] — the same
/// answer as laying out the whole text, but a long text is first tried by
/// its start only (if the start already overflows, so does the whole).
bool captionOverflows(
  String text,
  TextStyle style,
  double width,
  int maxLines,
  TextDirection direction,
  TextScaler scaler,
) {
  if (text.length > kCaptionMeasureChars) {
    final start = text.substring(0, _prefixEnd(text, kCaptionMeasureChars));
    if (_exceeds(start, style, width, maxLines, direction, scaler)) {
      return true;
    }
  }
  return _exceeds(text, style, width, maxLines, direction, scaler);
}

/// The number of lines [text] takes at [width], counted up to [cap] (a
/// bigger count is reported as [cap]) — enough for "more than N lines"
/// questions with N < [cap].
int captionLineCount(
  String text,
  TextStyle style,
  double width,
  TextDirection direction,
  TextScaler scaler, {
  required int cap,
}) {
  int count(String s) {
    final p = _layout(s, style, width, direction, scaler, maxLines: cap);
    final n = p.computeLineMetrics().length;
    p.dispose();
    return n;
  }

  if (text.length > kCaptionMeasureChars) {
    final n = count(text.substring(0, _prefixEnd(text, kCaptionMeasureChars)));
    if (n >= cap) return cap;
  }
  return count(text);
}

/// The largest n in 1..[length] with [fits] (0 if none) — exactly the
/// binary search the captions always ran (same probes, same answer even
/// where [fits] is not monotone, e.g. a long word that wraps differently
/// when cut). Each probe is cheap now: see [captionFits].
int captionCut(int length, bool Function(int n) fits) {
  var lo = 0;
  var hi = length;
  while (lo < hi) {
    final mid = (lo + hi + 1) ~/ 2;
    if (fits(mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/// Whether [shown] fits [maxLines] lines — a long string is decided by
/// its start when the start already overflows (see [captionOverflows]).
bool captionFits(
  String shown,
  TextStyle style,
  double width,
  int maxLines,
  TextDirection direction,
  TextScaler scaler,
) =>
    !captionOverflows(shown, style, width, maxLines, direction, scaler);
