import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/chat/data/link_preview_repository.dart';

export 'package:lawbid/features/chat/data/link_preview_repository.dart'
    show LinkPreview, LinkPreviewRepository, firstUrlIn;

final linkPreviewRepositoryProvider = Provider<LinkPreviewRepository>(
  (ref) => ApiLinkPreviewRepository(ref.watch(dioProvider)),
);

/// Owner 2026-10-22: Settings → Privacy → «Link previews» (on by default;
/// off = no card and no request for any link, like WhatsApp's switch).
class LinkPreviewsEnabled extends Notifier<bool> {
  static const key = 'chat.linkPreviews.v1';

  @override
  bool build() => ref.watch(localKvStoreProvider).getString(key) != 'off';

  Future<void> set({required bool enabled}) async {
    state = enabled;
    await ref
        .watch(localKvStoreProvider)
        .setString(key, enabled ? 'on' : 'off');
  }
}

final linkPreviewsEnabledProvider = NotifierProvider<LinkPreviewsEnabled, bool>(
  LinkPreviewsEnabled.new,
);

/// The preview of one address (null = nothing to draw). Kept while a card
/// on screen watches it; the repository remembers the answer longer.
final linkPreviewProvider =
    FutureProvider.autoDispose.family<LinkPreview?, String>(
  // Owner 2026-10-22: `GET /link-preview` needs a token — a guest asks
  // nothing and the card draws nothing.
  (ref, url) => ref.watch(isGuestProvider)
      ? Future<LinkPreview?>.value()
      : ref.watch(linkPreviewRepositoryProvider).fetch(url),
);
