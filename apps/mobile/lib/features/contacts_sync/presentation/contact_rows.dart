import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

/// A section title of the contacts lists ("On LawBid", "Invite to LawBid").
class ContactsSectionTitle extends ConsumerWidget {
  const ContactsSectionTitle(this.label, {this.count, super.key});

  final String label;
  final int? count;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xs,
      ),
      child: Text(
        count == null ? label : '$label · $count',
        style: type.caption.copyWith(
          color: colors.textSecondary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// One LawBid person from the phone book: avatar, the phone-book name,
/// the @username below, and [trailing] (the action buttons, or nothing in
/// the picker).
class LawBidContactRow extends ConsumerWidget {
  const LawBidContactRow({
    required this.contact,
    this.trailing,
    this.onTap,
    this.avatarSize = 36,
    super.key,
  });

  final LawBidContact contact;
  final double avatarSize;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final p = contact.person;
    final handle = p.username == null ? null : atHandle(p.username);
    final role = switch (p.role) {
      'attorney' => t.t('contact.attorney'),
      'client' => t.t('person.client'),
      'assistant' => t.t('tasks.people.inApp.assistant'),
      _ => null,
    };
    final sub = [
      if (role != null) role,
      if (handle != null) handle,
    ].join(' · ');
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            GoldRingAvatar(
              url: p.avatarUrl,
              initials:
                  contact.title.isEmpty ? '?' : avatarInitials(contact.title),
              size: 44,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    contact.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (sub.isNotEmpty)
                    Text(
                      sub,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

/// A phone-book person who is not on LawBid, with "Invite".
class InviteContactRow extends ConsumerWidget {
  const InviteContactRow({
    required this.contact,
    required this.onInvite,
    super.key,
  });

  final InvitableContact contact;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.sm,
      ),
      child: Row(
        children: [
          GoldRingAvatar(initials: avatarInitials(contact.name), size: 36),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              contact.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          // AppButton is full-width: bound it so it can't take the name's
          // room (a long label wraps inside).
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 124),
            child: AppButton(
              label: t.t('phoneContacts.inviteButton'),
              variant: AppButtonVariant.secondary,
              onPressed: onInvite,
            ),
          ),
        ],
      ),
    );
  }
}

/// Round outlined action (message / call / video) of a contact row, like
/// the buttons of the conversation header.
class ContactActionButton extends StatelessWidget {
  const ContactActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AppIconButton(
      icon: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: colors.border),
        ),
        alignment: Alignment.center,
        child: AppIcon(icon, color: colors.text, size: 16),
      ),
      semanticLabel: label,
      onPressed: onPressed,
    );
  }
}

/// Round selection mark of the multi-select picker.
class ContactCheck extends StatelessWidget {
  const ContactCheck({required this.on, super.key});

  final bool on;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: on ? colors.accent : null,
        border: Border.all(
          color: on ? colors.accent : colors.border,
          width: 1.5,
        ),
      ),
      alignment: Alignment.center,
      child:
          on ? AppIcon(AppIcons.check, color: colors.onAccent, size: 14) : null,
    );
  }
}
