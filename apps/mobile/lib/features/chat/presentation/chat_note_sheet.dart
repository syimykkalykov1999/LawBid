import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show CounterpartAvatar, counterpartName;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-19: a chat's note read from the chat list — a sheet with
/// the note, whether the chat waits for my answer, «Изменить» (the chat's
/// own menu) and «Открыть чат», without opening the chat.
///
/// Owner 2026-10-22: «Изменить» left and «Открыть чат» right in one row
/// (equal width), and a full-width «Удалить» under it that removes the note.
Future<void> showChatNoteSheet(
  BuildContext context,
  WidgetRef ref,
  Conversation c,
) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) =>
          ChatNoteSheet(conversation: c, host: context, hostRef: ref),
    );

class ChatNoteSheet extends ConsumerWidget {
  const ChatNoteSheet({
    required this.conversation,
    required this.host,
    required this.hostRef,
    super.key,
  });

  /// The list row's ref (alive after the sheet closes).
  final WidgetRef hostRef;

  final Conversation conversation;

  /// The list's context (the sheet's own one is gone once it closes).
  final BuildContext host;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = conversation;
    final canEdit = !c.awaitingMyAnswer && !ref.watch(isAssistantProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.8,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Row(
                children: [
                  CounterpartAvatar(counterpart: c.counterpart, size: 36),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      counterpartName(t, c),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Flexible(
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.goldTint,
                    borderRadius: BorderRadius.circular(AppRadii.card),
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            AppIcon(
                              AppIcons.stickyNote2Outlined,
                              size: 16,
                              color: colors.iconTint,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              t.t('chat.note.title'),
                              style: type.caption.copyWith(
                                color: colors.textSecondary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        SelectableText(
                          c.note ?? '',
                          style: type.body.copyWith(color: colors.text),
                        ),
                        if (c.waiting && c.waitingSince != null) ...[
                          const SizedBox(height: AppSpacing.sm),
                          Row(
                            children: [
                              AppIcon(
                                AppIcons.hourglassTopRounded,
                                size: 14,
                                color: colors.textSecondary,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  t.t('chat.waiting.chip', {
                                    'ago': SocialFormat.ago(
                                      t,
                                      f,
                                      c.waitingSince!,
                                    ),
                                  }),
                                  style: type.caption.copyWith(
                                    color: colors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  if (canEdit) ...[
                    Expanded(
                      child: AppButton(
                        key: const ValueKey('chat-note-edit'),
                        label: t.t('common.edit'),
                        icon: AppIcons.editOutlined,
                        variant: AppButtonVariant.secondary,
                        onPressed: () {
                          Navigator.of(context).pop();
                          showChatOrganizeSheet(host, hostRef, c);
                        },
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                  ],
                  Expanded(
                    child: AppButton(
                      key: const ValueKey('chat-note-open'),
                      label: t.t('chat.note.openChat'),
                      icon: AppIcons.chatBubbleOutlineRounded,
                      onPressed: () {
                        Navigator.of(context).pop();
                        host.push(ChatRoutes.conversation(c.id));
                      },
                    ),
                  ),
                ],
              ),
              if (canEdit) ...[
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  key: const ValueKey('chat-note-delete'),
                  label: t.t('chat.select.delete'),
                  icon: AppIcons.deleteOutlineRounded,
                  variant: AppButtonVariant.danger,
                  onPressed: () async {
                    final ok = await showConfirmSheet(
                      context,
                      t: t,
                      title: t.t('chat.note.title'),
                      message: c.note ?? '',
                      confirmLabel: t.t('chat.select.delete'),
                      destructive: true,
                    );
                    if (!ok || !context.mounted) return;
                    try {
                      await ref
                          .read(chatRepositoryProvider)
                          .organize(c.id, note: '');
                    } on Object catch (e) {
                      if (context.mounted) {
                        showAppSnackBar(context, errorText(t, e));
                      }
                      return;
                    }
                    refreshChatFolders(hostRef);
                    if (context.mounted) Navigator.of(context).pop();
                    if (host.mounted) {
                      showAppSnackBar(host, t.t('chat.select.deleted'));
                    }
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
