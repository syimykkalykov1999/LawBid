import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/core/media/video_prefetch.dart';

/// S16-4 + S20-9: the one gate of the video warm-up. The admin switch
/// (`client.video_prefetch_mode` Выкл/Вкл/Авто) is folded by the server into
/// two numbers (Wi-Fi `client.video_prefetch_ahead`, mobile data
/// `client.video_prefetch_cellular`; both 0 for «Выкл» or while Bunny video
/// traffic is over its warning level), and [ClientTuning.videoPrefetchAhead]
/// already picks the one for the current link. So the app warms reels only
/// while the data saver is off AND that number is above 0.
bool prefetchAllowed({required bool dataSaver, required int ahead}) =>
    !dataSaver && ahead > 0;

/// Wires [HlsPrefetcher.instance] to the policy. Read once at start.
final prefetchGateProvider = Provider<void>((ref) {
  HlsPrefetcher.instance.allow = () => prefetchAllowed(
        dataSaver: ref.read(dataSaverProvider),
        ahead: ClientTuning.videoPrefetchAhead,
      );
  ref.onDispose(() => HlsPrefetcher.instance.allow = () => true);
});
