/// Owner 2026-10-24 (Cloudflare SFU group calls): small readings of an SDP
/// that the SFU client needs — no WebRTC, so they are tested on plain text.
library;

/// One media section (`m=` line) of an SDP.
class SdpSection {
  const SdpSection({
    required this.kind,
    required this.mid,
    required this.direction,
    required this.msidTrackId,
  });

  /// `audio` | `video` | `application`.
  final String kind;

  /// The `a=mid:` value ('' when the section has none).
  final String mid;

  /// `sendonly` | `recvonly` | `sendrecv` | `inactive` ('' when not stated).
  final String direction;

  /// The track id of `a=msid:<stream> <track>`, or null.
  final String? msidTrackId;
}

/// The media sections of [sdp], in order.
List<SdpSection> sdpSections(String sdp) {
  final out = <SdpSection>[];
  String? kind;
  var mid = '';
  var direction = '';
  String? track;
  var open = false;

  void flush() {
    if (open) {
      out.add(
        SdpSection(
          kind: kind ?? '',
          mid: mid,
          direction: direction,
          msidTrackId: track,
        ),
      );
    }
  }

  for (final raw in sdp.split(RegExp(r'\r?\n'))) {
    final line = raw.trim();
    if (line.startsWith('m=')) {
      flush();
      open = true;
      kind = line.substring(2).split(' ').first;
      mid = '';
      direction = '';
      track = null;
    } else if (!open) {
      continue;
    } else if (line.startsWith('a=mid:')) {
      mid = line.substring(6).trim();
    } else if (line == 'a=sendonly' ||
        line == 'a=recvonly' ||
        line == 'a=sendrecv' ||
        line == 'a=inactive') {
      direction = line.substring(2);
    } else if (line.startsWith('a=msid:')) {
      final parts = line.substring(7).trim().split(RegExp(r'\s+'));
      if (parts.length > 1 && track == null) track = parts[1];
    }
  }
  flush();
  return out;
}

/// The mids of the sending sections of our offer, per kind and in order:
/// how the transceivers we added are named in the SDP.
List<String> sendOnlyMids(String sdp, String kind) => [
      for (final s in sdpSections(sdp))
        if (s.kind == kind && s.direction == 'sendonly' && s.mid.isNotEmpty)
          s.mid,
    ];

/// `trackId -> mid` of the SFU's offer (`a=msid`), used when the platform
/// does not tell which transceiver an incoming track belongs to.
Map<String, String> midByTrackId(String sdp) => {
      for (final s in sdpSections(sdp))
        if (s.msidTrackId != null && s.mid.isNotEmpty) s.msidTrackId!: s.mid,
    };
