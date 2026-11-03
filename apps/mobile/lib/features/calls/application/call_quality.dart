/// How good one call link is, and what to send over it (owner 2026-10-21:
/// calls must survive the worst internet). Pure functions, no WebRTC.
library;

/// A link's health, best first.
enum LinkQuality { good, fair, poor, bad }

/// One reading of a link (WebRTC stats): round trip in ms, packet loss in
/// percent, the estimated outgoing bandwidth in bit/s (0 = unknown).
class LinkStats {
  const LinkStats({
    this.rttMs = 0,
    this.lossPct = 0,
    this.availableBps = 0,
    this.jitterMs = 0,
    this.localCandidate = '',
    this.remoteCandidate = '',
  });

  final double rttMs;
  final double lossPct;
  final double availableBps;

  /// The worst inbound jitter in ms (0 = unknown).
  final double jitterMs;

  /// The candidate types of the pair in use (`host`, `srflx`, `prflx`,
  /// `relay`; empty = unknown): `relay` = the call goes through TURN.
  final String localCandidate;
  final String remoteCandidate;
}

/// Owner 2026-10-28 («calls lag», R-037): every reading of a call's links,
/// summed up in one line when the call closes — the next phone test tells
/// round trip, jitter, loss and whether the call went direct or through
/// TURN. Light: a few numbers per poll, one report per call.
class CallStatsLog {
  final _rtt = <double>[];
  final _jitter = <double>[];
  double _lossMax = 0;
  double _bpsMin = 0;
  final _pairs = <String>{};

  int get samples => _rtt.length;

  void add(LinkStats s) {
    _rtt.add(s.rttMs);
    _jitter.add(s.jitterMs);
    if (s.lossPct > _lossMax) _lossMax = s.lossPct;
    if (s.availableBps > 0 && (_bpsMin == 0 || s.availableBps < _bpsMin)) {
      _bpsMin = s.availableBps;
    }
    if (s.localCandidate.isNotEmpty || s.remoteCandidate.isNotEmpty) {
      _pairs.add('${_or(s.localCandidate)}>${_or(s.remoteCandidate)}');
    }
  }

  static String _or(String v) => v.isEmpty ? '?' : v;

  static double _median(List<double> v) {
    final s = [...v]..sort();
    return s[s.length ~/ 2];
  }

  static double _max(List<double> v) =>
      v.fold<double>(0, (a, b) => b > a ? b : a);

  /// `null` when nothing was read (the link never came up).
  String? summary(String kind) {
    if (_rtt.isEmpty) return null;
    String ms(double v) => v.round().toString();
    return 'callstats $kind n=$samples '
        'rtt=${ms(_median(_rtt))}/${ms(_max(_rtt))}ms '
        'jitter=${ms(_median(_jitter))}/${ms(_max(_jitter))}ms '
        'loss<=${_lossMax.toStringAsFixed(1)}% '
        'bwmin=${(_bpsMin / 1000).round()}kbps '
        'pair=${_pairs.isEmpty ? '?' : _pairs.join(',')}';
  }
}

/// The quality one reading alone points to.
LinkQuality classifyStats(LinkStats s) {
  final bps = s.availableBps;
  if (s.lossPct >= 20 || s.rttMs >= 1500 || (bps > 0 && bps < 60000)) {
    return LinkQuality.bad;
  }
  if (s.lossPct >= 10 || s.rttMs >= 700 || (bps > 0 && bps < 150000)) {
    return LinkQuality.poor;
  }
  if (s.lossPct >= 3 || s.rttMs >= 300 || (bps > 0 && bps < 500000)) {
    return LinkQuality.fair;
  }
  return LinkQuality.good;
}

/// Smooths readings: down at once after [downAfter] worse readings in a row,
/// up one step only after [upAfter] better ones — the picture must not
/// flicker between sizes on a shaky link.
class QualityTracker {
  QualityTracker({this.downAfter = 2, this.upAfter = 5});

  final int downAfter;
  final int upAfter;
  LinkQuality _current = LinkQuality.good;
  int _worse = 0;
  int _better = 0;

  LinkQuality get current => _current;

  LinkQuality add(LinkStats s) {
    final seen = classifyStats(s);
    if (seen.index > _current.index) {
      _better = 0;
      if (++_worse >= downAfter) {
        _current = seen;
        _worse = 0;
      }
    } else if (seen.index < _current.index) {
      _worse = 0;
      if (++_better >= upAfter) {
        _current = LinkQuality.values[_current.index - 1];
        _better = 0;
      }
    } else {
      _worse = 0;
      _better = 0;
    }
    return _current;
  }
}

/// What the camera may send over one link; [active] false = video paused
/// (the audio goes on).
class VideoTier {
  const VideoTier({
    required this.active,
    required this.maxBitrate,
    required this.scaleDown,
    required this.maxFps,
  });

  final bool active;
  final int maxBitrate;
  final double scaleDown;
  final int maxFps;
}

/// The camera setting for [q]. In a group call every member gets their own
/// copy of the picture, so the budget is shared by the [links] links.
VideoTier videoTierFor(LinkQuality q, {int links = 1}) {
  final share = links < 1 ? 1 : links;
  int cap(int bps) {
    final v = bps ~/ share;
    return v < 120000 ? 120000 : v;
  }

  switch (q) {
    case LinkQuality.good:
      return VideoTier(
        active: true,
        maxBitrate: cap(1200000),
        scaleDown: 1,
        maxFps: 30,
      );
    case LinkQuality.fair:
      return VideoTier(
        active: true,
        maxBitrate: cap(600000),
        scaleDown: 2,
        maxFps: 24,
      );
    case LinkQuality.poor:
      return VideoTier(
        active: true,
        maxBitrate: cap(250000),
        scaleDown: 4,
        maxFps: 15,
      );
    case LinkQuality.bad:
      return const VideoTier(
        active: false,
        maxBitrate: 100000,
        scaleDown: 4,
        maxFps: 10,
      );
  }
}

/// Opus settings for a bad network: in-band FEC (a lost packet is rebuilt
/// from the next one), DTX (silence costs nothing), mono, a voice-sized
/// bitrate ceiling. Only the Opus `a=fmtp` line is touched.
String tuneOpusSdp(String sdp, {int maxAverageBitrate = 32000}) {
  final eol = sdp.contains('\r\n') ? '\r\n' : '\n';
  final lines = sdp.split(eol);
  final opus = RegExp(r'^a=rtpmap:(\d+) opus/48000', caseSensitive: false);
  final ids = <String>{
    for (final l in lines)
      if (opus.firstMatch(l) case final m?) m.group(1)!,
  };
  if (ids.isEmpty) return sdp;
  const wanted = {
    'minptime': '10',
    'useinbandfec': '1',
    'usedtx': '1',
    'stereo': '0',
    'sprop-stereo': '0',
    'cbr': '0',
  };
  final out = <String>[];
  for (final l in lines) {
    final m = RegExp(r'^a=fmtp:(\d+) (.*)$').firstMatch(l);
    if (m != null && ids.contains(m.group(1))) {
      final params = <String, String>{};
      for (final p in m.group(2)!.split(';')) {
        final kv = p.trim().split('=');
        if (kv.first.isEmpty) continue;
        params[kv.first] = kv.length > 1 ? kv.sublist(1).join('=') : '';
      }
      params
        ..addAll(wanted)
        ..['maxaveragebitrate'] = '$maxAverageBitrate';
      out.add('a=fmtp:${m.group(1)} ${_joinParams(params)}');
      continue;
    }
    out.add(l);
    // Opus has no fmtp line at all: add one right after its rtpmap.
    final r = opus.firstMatch(l);
    if (r != null && !lines.any((x) => x.startsWith('a=fmtp:${r.group(1)} '))) {
      final p = {...wanted, 'maxaveragebitrate': '$maxAverageBitrate'};
      out.add('a=fmtp:${r.group(1)} ${_joinParams(p)}');
    }
  }
  return out.join(eol);
}

String _joinParams(Map<String, String> p) => p.entries
    .map((e) => e.value.isEmpty ? e.key : '${e.key}=${e.value}')
    .join(';');
