import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';

/// The direct chat with a person, from the chat list saved on the phone
/// (no server request; rule «no needless server requests»). Null when
/// there is none yet.
final savedDirectChatProvider = FutureProvider.autoDispose
    .family<Conversation?, String>((ref, userId) async {
  final page = await ref.read(chatListCacheProvider).read();
  for (final c in page?.items ?? const <Conversation>[]) {
    if (c.isDirect && c.counterpart.id == userId) return c;
  }
  return null;
});

/// R-012 (owner 2026-10-23: «как в вацапе и телеге добавь кнопки
/// видеозвонка»): a video call straight from a profile. Shown only where
/// the chat header would show it: a direct chat with this person already
/// open for calls (same rules, [chatAudioCallAllowed]) and the owner's
/// `video_calls` switch on. Otherwise nothing is drawn. [builder] gives the
/// button its profile look.
class ProfileVideoCallButton extends ConsumerWidget {
  const ProfileVideoCallButton({
    required this.userId,
    required this.builder,
    super.key,
  });

  final String userId;
  final Widget Function(String label, VoidCallback onTap) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(videoCallsEnabledProvider)) return const SizedBox.shrink();
    final c = ref.watch(savedDirectChatProvider(userId)).value;
    if (c == null || !chatAudioCallAllowed(ref, c)) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    return builder(t.t('call.videoButton'), () {
      AppHaptics.medium();
      ref.read(callControllerProvider.notifier).call(
            c.id,
            peer: c.counterpart.id == null
                ? null
                : CallPeer(
                    id: c.counterpart.id!,
                    isAttorney: c.counterpart.isAttorney,
                    displayName: c.counterpart.displayName,
                    username: c.counterpart.username,
                    avatarUrl: c.counterpart.avatarUrl,
                  ),
            video: true,
          );
    });
  }
}
