import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/connectivity_status.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Row 110 (Telegram: the title of the chats list and of a chat reads
/// «Waiting for network…» while the phone has no network and
/// «Connecting…» while the network is there but the server is not):
/// what to show instead of the normal title, null while online.
String? connectionTitle(Translator t, OfflineReason? reason) =>
    switch (reason) {
      null => null,
      OfflineReason.noNetwork => t.t('net.waiting'),
      OfflineReason.serverUnreachable => t.t('call.status.connecting'),
    };

/// The reason the app is offline; rebuilds only when it changes.
OfflineReason? watchOfflineReason(WidgetRef ref) => ref.watch(
      connectivityStatusProvider.select((s) => s.offlineReason),
    );
