import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/consultations/application/consultations_providers.dart';
import 'package:lawbid/features/consultations/consultations_routes.dart';
import 'package:lawbid/features/consultations/presentation/consultation_widgets.dart';

/// The id in a chat system line `consult:<id>`, or null for any other line.
String? consultationIdOfSystemLine(String body) =>
    body.startsWith('consult:') && body.length > 8 ? body.substring(8) : null;

/// Owner 2026-10-20 — the chat line of a booking: when, where it stands,
/// a tap opens it, and at the appointed time a «Позвонить» button (the
/// ordinary 1:1 call of this chat) shows up.
class ConsultationChatCard extends ConsumerWidget {
  const ConsultationChatCard({required this.consultationId, super.key});

  final String consultationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(consultationProvider(consultationId));
    final c = value.value;
    if (c == null) {
      // Loading or gone: a quiet one-line stand-in.
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Center(
          child: Text(
            t.t('chat.system.consult'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      );
    }

    void call() {
      final id = c.conversationId;
      if (id == null) return;
      HapticFeedback.mediumImpact();
      ref.read(callControllerProvider.notifier).call(
            id,
            peer: CallPeer(
              id: c.counterpart.id,
              isAttorney: !c.viewerIsAttorney,
              displayName: c.counterpart.displayName,
              username: c.counterpart.username,
              avatarUrl: c.counterpart.avatarUrl,
            ),
          );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Semantics(
            button: true,
            label: '${t.t('consult.one')}, ${consultationWhen(f, c)}, '
                '${consultationStatusLabel(t, c.status)}',
            excludeSemantics: true,
            onTap: () => context.push(ConsultationsRoutes.detail(c.id)),
            child: AppCard(
              onTap: () => context.push(ConsultationsRoutes.detail(c.id)),
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      AppIcon(
                        AppIcons.eventAvailableRounded,
                        size: 20,
                        color: colors.text,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          t.t('consult.one'),
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      StatusPill(
                        label: consultationStatusLabel(t, c.status),
                        tone: consultationTone(c.status),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    consultationWhen(f, c),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                  ClockTicker(
                    builder: (context, now) => consultationCallOpen(c, now) &&
                            c.conversationId != null
                        ? Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: AppButton(
                              key: const ValueKey('consult-chat-call'),
                              label: t.t('consult.call'),
                              icon: AppIcons.callRounded,
                              height: 44,
                              onPressed: call,
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
