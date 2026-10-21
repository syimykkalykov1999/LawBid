import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show StatsReport;
import 'package:lawbid/features/calls/application/call_media.dart'
    show linkStatsFrom;
import 'package:lawbid/features/calls/application/call_quality.dart';

void main() {
  group('classifyStats', () {
    test('thresholds', () {
      expect(classifyStats(const LinkStats(rttMs: 80)), LinkQuality.good);
      expect(classifyStats(const LinkStats(lossPct: 4)), LinkQuality.fair);
      expect(classifyStats(const LinkStats(rttMs: 800)), LinkQuality.poor);
      expect(
        classifyStats(const LinkStats(availableBps: 100000)),
        LinkQuality.poor,
      );
      expect(classifyStats(const LinkStats(lossPct: 25)), LinkQuality.bad);
      expect(
        classifyStats(const LinkStats(availableBps: 40000)),
        LinkQuality.bad,
      );
    });
  });

  group('QualityTracker', () {
    test('drops after two bad readings, climbs one step after five good', () {
      final t = QualityTracker();
      const bad = LinkStats(lossPct: 30);
      const good = LinkStats(rttMs: 50);
      expect(t.add(bad), LinkQuality.good);
      expect(t.add(bad), LinkQuality.bad);
      for (var i = 0; i < 4; i++) {
        expect(t.add(good), LinkQuality.bad);
      }
      expect(t.add(good), LinkQuality.poor);
      for (var i = 0; i < 5; i++) {
        t.add(good);
      }
      expect(t.current, LinkQuality.fair);
    });

    test('one bad reading in a good run changes nothing', () {
      final t = QualityTracker()
        ..add(const LinkStats(lossPct: 30))
        ..add(const LinkStats(rttMs: 40));
      expect(t.current, LinkQuality.good);
    });
  });

  group('videoTierFor', () {
    test('thins as the link gets worse and pauses on bad', () {
      final good = videoTierFor(LinkQuality.good);
      final poor = videoTierFor(LinkQuality.poor);
      expect(poor.maxBitrate, lessThan(good.maxBitrate));
      expect(poor.scaleDown, greaterThan(good.scaleDown));
      expect(videoTierFor(LinkQuality.bad).active, isFalse);
      expect(good.active, isTrue);
    });

    test('a group shares the budget but keeps a floor', () {
      expect(
        videoTierFor(LinkQuality.good, links: 3).maxBitrate,
        400000,
      );
      expect(
        videoTierFor(LinkQuality.poor, links: 5).maxBitrate,
        120000,
      );
    });
  });

  group('tuneOpusSdp', () {
    const sdp = 'v=0\r\n'
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 63\r\n'
        'a=rtpmap:111 opus/48000/2\r\n'
        'a=fmtp:111 minptime=10;useinbandfec=0\r\n'
        'a=rtpmap:63 red/48000/2\r\n'
        'a=fmtp:63 111/111\r\n';

    test('turns on FEC and DTX and caps the bitrate on the Opus line only', () {
      final out = tuneOpusSdp(sdp);
      expect(out, contains('useinbandfec=1'));
      expect(out, isNot(contains('useinbandfec=0')));
      expect(out, contains('usedtx=1'));
      expect(out, contains('maxaveragebitrate=32000'));
      expect(out, contains('a=fmtp:63 111/111'));
      final fmtp = out.split('\r\n').where((l) => l.startsWith('a=fmtp:111'));
      expect(fmtp, hasLength(1));
    });

    test('adds an fmtp line when Opus has none; leaves other SDP alone', () {
      final out = tuneOpusSdp('a=rtpmap:111 opus/48000/2\n');
      expect(out, contains('a=fmtp:111 '));
      expect(out, contains('usedtx=1'));
      const video = 'm=video 9 RTP/AVP 96\na=rtpmap:96 VP8/90000\n';
      expect(tuneOpusSdp(video), video);
    });
  });

  group('linkStatsFrom', () {
    test('reads rtt, bandwidth and loss from the nominated pair', () {
      final s = linkStatsFrom([
        StatsReport('p', 'candidate-pair', 0, {
          'nominated': true,
          'currentRoundTripTime': 0.25,
          'availableOutgoingBitrate': 300000,
        }),
        StatsReport('r', 'remote-inbound-rtp', 0, {'fractionLost': 0.05}),
      ])!;
      expect(s.rttMs, 250);
      expect(s.availableBps, 300000);
      expect(s.lossPct, closeTo(5, 0.001));
    });

    test('null while there is no pair yet', () {
      expect(linkStatsFrom([StatsReport('x', 'transport', 0, {})]), isNull);
    });
  });
}
