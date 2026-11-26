import 'dart:math';

/// Stage 2 SRE (Б5, 25.11): the retry budget of gRFC A6 «gRPC Retry
/// Design», section «Retry Throttling» (github.com/grpc/proposal A6,
/// Apache-2.0). Ported one to one from grpc-java
/// `io.grpc.internal.RetriableStream.Throttle` (Apache-2.0, see
/// THIRD_PARTY_NOTICES): the counts are kept in thousandths so a
/// `tokenRatio` of 0.1 adds exactly 100.
///
/// - The bucket starts full (`maxTokens`).
/// - Every failed attempt of the kind a retry is made for takes 1 token.
/// - Every answered request gives back `tokenRatio` (never above the max).
/// - A repeat is sent only while MORE than half the tokens are left.
///
/// So when the server is down every phone stops multiplying its load after
/// a handful of failures (SRE Book ch. 22 «retry budget»), and starts
/// repeating again on its own once answers come back.
class RetryThrottle {
  RetryThrottle({required double maxTokens, required double tokenRatio})
      : _maxTokens = (maxTokens * _scale).toInt(),
        _tokenRatio = (tokenRatio * _scale).toInt(),
        _threshold = (maxTokens * _scale).toInt() ~/ 2 {
    _tokenCount = _maxTokens;
  }

  /// grpc-java THREE_DECIMAL_PLACES_SCALE_UP.
  static const _scale = 1000;

  final int _maxTokens;
  final int _tokenRatio;
  final int _threshold;
  late int _tokenCount;

  /// The tokens left, as a number of whole tokens (tests, diagnostics).
  double get tokens => _tokenCount / _scale;

  /// A repeat may be sent now.
  bool get isAboveThreshold => _tokenCount > _threshold;

  /// A failed attempt (retryable kind) takes a token; true when a repeat
  /// may still be sent.
  bool onQualifiedFailureThenCheckIsAboveThreshold() {
    if (_tokenCount == 0) return false;
    final decremented = _tokenCount - _scale;
    _tokenCount = max(decremented, 0);
    return decremented > _threshold;
  }

  /// An answered request gives back `tokenRatio` tokens.
  void onSuccess() {
    if (_tokenCount == _maxTokens) return;
    _tokenCount = min(_tokenCount + _tokenRatio, _maxTokens);
  }
}

/// Stage 2 SRE (Б5): client-side adaptive throttling, Google SRE Book
/// ch. 21 «Handling Overload», section «Client-Side Throttling»: each client
/// keeps, for the last `window` (2 minutes in the book), the number of
/// `requests` it attempted and of `accepts` the backend took, and rejects a
/// new request itself with probability
///
///     max(0, (requests − K × accepts) / (requests + 1))
///
/// so a backend that is refusing work stops receiving work that would be
/// refused anyway. The app applies it only to prefetch and background
/// requests (RetryInterceptor); what a person waits for is always sent.
/// K = `k` (the book recommends 2); `k` = 0 turns it off.
class AdaptiveThrottle {
  AdaptiveThrottle({
    required double Function() k,
    required Duration Function() window,
    DateTime Function()? now,
    Random? random,
  })  : _k = k,
        _window = window,
        _now = now ?? DateTime.now,
        _random = random ?? Random();

  final double Function() _k;
  final Duration Function() _window;
  final DateTime Function() _now;
  final Random _random;

  /// One entry per attempt: when, and whether the backend took it.
  final List<(DateTime, bool?)> _log = [];

  void _trim() {
    final from = _now().subtract(_window());
    while (_log.isNotEmpty && _log.first.$1.isBefore(from)) {
      _log.removeAt(0);
    }
    // A hard cap keeps a long burst cheap (the ratio is all that matters).
    if (_log.length > 4096) _log.removeRange(0, _log.length - 4096);
  }

  /// Requests attempted in the window (also the ones rejected locally).
  int get requests {
    _trim();
    return _log.length;
  }

  /// Requests the backend accepted in the window.
  int get accepts {
    _trim();
    return _log.where((e) => e.$2 == true).length;
  }

  /// The client-side rejection probability right now.
  double get rejectProbability {
    final k = _k();
    if (k <= 0) return 0;
    final r = requests;
    return max(0, (r - k * accepts) / (r + 1));
  }

  /// Called before an attempt goes out: false = rejected locally (it is
  /// still counted as a request, as in the book). An admitted attempt is
  /// settled later with [settle] or [forget].
  bool admit({required bool mayReject}) {
    final reject = mayReject && _random.nextDouble() < rejectProbability;
    _log.add((_now(), reject ? false : null));
    return !reject;
  }

  /// One attempt in flight got its answer: [accepted] = the backend took it
  /// (any answer but an overload refusal). Only the counts matter, so the
  /// newest unsettled entry is the one marked.
  void settle({required bool accepted}) => _mark(accepted);

  /// An attempt the app cancelled itself counts neither way.
  void forget() => _mark(null, remove: true);

  void _mark(bool? accepted, {bool remove = false}) {
    _trim();
    for (var i = _log.length - 1; i >= 0; i--) {
      if (_log[i].$2 == null) {
        if (remove) {
          _log.removeAt(i);
        } else {
          _log[i] = (_log[i].$1, accepted);
        }
        return;
      }
    }
  }
}
