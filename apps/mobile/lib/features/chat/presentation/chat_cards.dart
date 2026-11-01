import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/addresses/address_field.dart';
import 'package:lawbid/core/addresses/open_in_maps.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/chat/domain/card_tools.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart'
    show attorneyShareLink;
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart'
    show nameWithCheck, practiceLabel;
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:share_plus/share_plus.dart';

/// Owner 2026-10-20: the longest address a place card carries (the server
/// refuses more).
const int kPlaceMaxChars = 200;

/// Saves the card as a `.vcf` and opens the share sheet — the phone's
/// «Add to contacts» is in it. Name, firm, practice and the LawBid link;
/// never a phone or an e-mail.
Future<void> shareContactVCard(
  BuildContext context,
  WidgetRef ref,
  ContactCard card,
) async {
  final t = ref.read(translatorProvider);
  final host = ref.read(appEnvironmentProvider).deepLinkHost;
  final text = buildVCard(
    card,
    role: t.t('contact.attorney'),
    practice: [for (final k in card.practiceKeys) practiceLabel(t, k)],
    profileUrl: attorneyShareLink(host, card.username),
  );
  final box = context.findRenderObject() as RenderBox?;
  try {
    await SharePlus.instance.share(
      ShareParams(
        files: [
          XFile.fromData(
            Uint8List.fromList(utf8.encode(text)),
            mimeType: 'text/vcard',
            name: vCardFileName(card),
          ),
        ],
        fileNameOverrides: [vCardFileName(card)],
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}

/// The inner frame of a card inside a bubble: a soft panel in the bubble's
/// own text colour, so it follows every theme.
class _CardFrame extends StatelessWidget {
  const _CardFrame({required this.mine, required this.child});

  final bool mine;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    return Container(
      width: 240,
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: fg.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
    );
  }
}

/// One small action under a card.
class _CardAction extends StatelessWidget {
  const _CardAction({
    required this.label,
    required this.onTap,
    required this.fg,
    this.icon,
  });

  final String label;
  final VoidCallback onTap;
  final Color fg;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  AppIcon(icon, size: 16, color: fg),
                  const SizedBox(width: 4),
                ],
                Flexible(
                  child: FitText(
                    label,
                    style: type.caption.copyWith(
                      color: fg,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// An attorney's card in a bubble: photo, name with the blue check, the
/// role and practice, and «Profile» / «Message» / «Save» (a vCard).
class ContactCardBody extends ConsumerWidget {
  const ContactCardBody({required this.card, required this.mine, super.key});

  final ContactCard card;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final me = ref.watch(currentUserIdProvider);
    final practice = [
      for (final k in card.practiceKeys.take(2)) practiceLabel(t, k),
    ].join(', ');
    return _CardFrame(
      mine: mine,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppAvatar(
                size: 44,
                initials: avatarInitials(card.displayName),
                imageProvider: card.avatarUrl == null
                    ? null
                    : stableNetworkImage(card.avatarUrl!),
                semanticLabel: card.displayName,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text.rich(
                      nameWithCheck(
                        card.displayName,
                        verified: card.verified,
                        checkLabel: t.t('post.verified'),
                        style: type.body.copyWith(
                          color: fg,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      style: type.body.copyWith(
                        color: fg,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      t.t('contact.attorney'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: meta),
                    ),
                    if (practice.isNotEmpty)
                      Text(
                        practice,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(color: meta),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          ContactActionsRow(
            fg: fg,
            actions: [
              ContactActionSpec(
                id: 'profile',
                label: t.t('contact.profile'),
                icon: AppIcons.person,
                onTap: () => context.push(AppRoutes.lawyer(card.username)),
              ),
              if (card.userId != me)
                ContactActionSpec(
                  id: 'message',
                  label: t.t('phoneContacts.message'),
                  icon: AppIcons.chatBubbleOutlineRounded,
                  onTap: () =>
                      unawaited(openDirectChat(context, ref, card.userId)),
                ),
              ContactActionSpec(
                id: 'save',
                label: t.t('common.save'),
                icon: AppIcons.iosShareRounded,
                onTap: () => unawaited(shareContactVCard(context, ref, card)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One action of [ContactActionsRow].
class ContactActionSpec {
  const ContactActionSpec({
    required this.id,
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String id;
  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

/// Owner 2026-10-28 (WhatsApp / Telegram contact card): equal-width actions
/// under a thin top line, thin dividers between them, one text style, the
/// icon above the label, each segment at least 44 dp tall with ink feedback.
/// A long label shrinks to its segment (the design system's FitText rule),
/// it is never clipped.
class ContactActionsRow extends StatelessWidget {
  const ContactActionsRow({required this.actions, required this.fg, super.key});

  final List<ContactActionSpec> actions;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    final line = fg.withValues(alpha: 0.14);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(height: 1, color: line),
        Material(
          type: MaterialType.transparency,
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) Container(width: 1, color: line),
                  Expanded(
                    child: _ContactAction(spec: actions[i], fg: fg),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ContactAction extends StatelessWidget {
  const _ContactAction({required this.spec, required this.fg});

  final ContactActionSpec spec;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: spec.label,
      excludeSemantics: true,
      child: InkWell(
        key: ValueKey('contact-action-${spec.id}'),
        onTap: spec.onTap,
        splashColor: fg.withValues(alpha: 0.12),
        highlightColor: fg.withValues(alpha: 0.08),
        hoverColor: fg.withValues(alpha: 0.06),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.xs,
              vertical: AppSpacing.xs,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppIcon(spec.icon, size: 20, color: fg),
                const SizedBox(height: 2),
                FitText(
                  spec.label,
                  style: type.caption.copyWith(
                    color: fg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A place in a bubble: the address and «Open in maps».
class PlaceCardBody extends ConsumerWidget {
  const PlaceCardBody({required this.address, required this.mine, super.key});

  final String address;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    // Owner 2026-10-28: the whole card opens the maps chooser (before only
    // the small «Open in maps» line did; a tap on the address did nothing).
    return AppPressable(
      key: const ValueKey('place-card'),
      onTap: () => unawaited(openAddressInMaps(context, t, address)),
      child: _CardFrame(
        mine: mine,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(AppIcons.placeOutlined, size: 22, color: fg),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    address,
                    style: type.body.copyWith(color: fg, height: 1.3),
                  ),
                ),
              ],
            ),
            _CardAction(
              label: t.t('card.map'),
              icon: AppIcons.openInNewRounded,
              fg: fg,
              onTap: () => unawaited(openAddressInMaps(context, t, address)),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Contact» in the attach sheet: one attorney from the people search (or
/// the caller's own profile when they are an attorney). Returns the picked
/// user's id.
Future<String?> pickContactToShare(BuildContext context, WidgetRef ref) {
  return showAppBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => const _ContactPicker(),
  );
}

class _ContactPicker extends ConsumerStatefulWidget {
  const _ContactPicker();

  @override
  ConsumerState<_ContactPicker> createState() => _ContactPickerState();
}

class _ContactPickerState extends ConsumerState<_ContactPicker> {
  final _query = TextEditingController();
  Timer? _debounce;
  String _q = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _changed(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _q = v.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final user = ref.watch(currentUserControllerProvider).user;
    final meAttorney = user?.role == UserRole.attorney;
    final result = ref.watch(peopleSearchProvider(attorneySearchKey(_q)));
    final rows = [
      for (final p in result.value?.items ?? const <PersonRow>[])
        if (p.attorney != null && p.attorney!.id != user?.id) p.attorney!,
    ];
    final height = MediaQuery.sizeOf(context).height * 0.7;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SizedBox(
          height: height,
          child: Column(
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: AppTextField(
                  compact: true,
                  controller: _query,
                  leading: const AppIcon(AppIcons.searchRounded),
                  hintText: t.t('card.find'),
                  semanticLabel: t.t('card.find'),
                  onChanged: _changed,
                  textInputAction: TextInputAction.search,
                ),
              ),
              if (meAttorney && _q.isEmpty)
                AppListRow(
                  icon: AppIcons.badgeOutlined,
                  label: t.t('card.mine'),
                  showChevron: false,
                  onTap: () => Navigator.of(context).pop(user!.id),
                ),
              Expanded(
                child: result.isLoading && rows.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : rows.isEmpty
                        ? Center(
                            child: Text(
                              t.t('search.empty.title'),
                              style: TextStyle(color: colors.textSecondary),
                            ),
                          )
                        : ListView.builder(
                            itemCount: rows.length,
                            itemBuilder: (context, i) {
                              final r = rows[i];
                              return AppListRow(
                                label: r.displayName,
                                subtitle: r.practiceKeys.isEmpty
                                    ? null
                                    : [
                                        for (final k in r.practiceKeys.take(2))
                                          practiceLabel(t, k),
                                      ].join(', '),
                                showChevron: false,
                                onTap: () => Navigator.of(context).pop(r.id),
                              );
                            },
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// «Place» in the attach sheet: the address to send. Returns it trimmed.
Future<String?> askPlaceAddress(BuildContext context, WidgetRef ref) {
  return showAppBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => const _PlaceSheet(),
  );
}

class _PlaceSheet extends ConsumerStatefulWidget {
  const _PlaceSheet();

  @override
  ConsumerState<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends ConsumerState<_PlaceSheet> {
  final _address = TextEditingController();

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final ready = _address.text.trim().isNotEmpty;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
          left: AppSpacing.screenSide,
          right: AppSpacing.screenSide,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            // Owner 2026-10-28: US address suggestions while typing.
            AddressField(
              key: const ValueKey('place-address'),
              controller: _address,
              autofocus: true,
              leading: const AppIcon(AppIcons.placeOutlined),
              hintText: t.t('card.address'),
              semanticLabel: t.t('card.address'),
              maxLength: kPlaceMaxChars,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('card.share'),
              icon: AppIcons.placeOutlined,
              isEnabled: ready,
              onPressed: () => Navigator.of(context).pop(_address.text.trim()),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }
}
