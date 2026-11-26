import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/e2ee/security_code_screen.dart';
import 'package:material_ui/material_ui.dart';

/// Item 25: the row of the thread where the notice goes — the first
/// message sent after the chat became end-to-end encrypted.
bool e2eeStartsAt(DateTime? since, DateTime first, DateTime? olderMessage) {
  if (since == null || first.isBefore(since)) return false;
  return olderMessage == null || olderMessage.isBefore(since);
}

/// Copy of WhatsApp's yellow notice in the thread: a lock and «Сообщения и
/// звонки защищены сквозным шифрованием…»; a tap opens the security code.
class E2eeNotice extends ConsumerWidget {
  const E2eeNotice({required this.onTap, super.key});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Material(
            key: const ValueKey('e2ee-notice'),
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.card),
            child: InkWell(
              borderRadius: BorderRadius.circular(AppRadii.card),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Text.rich(
                  TextSpan(
                    children: [
                      WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: Padding(
                          padding: const EdgeInsetsDirectional.only(
                            end: AppSpacing.xs,
                          ),
                          child: Icon(
                            AppIcons.lockOutlineRounded,
                            size: 14,
                            color: colors.textSecondary,
                          ),
                        ),
                      ),
                      TextSpan(text: t.t('chat.e2ee.notice')),
                    ],
                  ),
                  textAlign: TextAlign.center,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The security code with the chat's other person (WhatsApp: the notice
/// and «Шифрование» in the contact's info lead there).
void openE2eeInfo(BuildContext context, WidgetRef ref, Conversation c) {
  final other = c.counterpart.id;
  if (other == null) return;
  final t = ref.read(translatorProvider);
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => SecurityCodeScreen(
        conversationId: c.id,
        otherUserId: other,
        otherName: c.counterpart.displayName ?? t.t('chat.e2ee.theOther'),
      ),
    ),
  );
}
