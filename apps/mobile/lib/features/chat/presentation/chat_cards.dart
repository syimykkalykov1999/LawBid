import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-20: the longest address a place card carries (the server
/// refuses more).
const int kPlaceMaxChars = 200;

/// Opens [address] in the phone's maps (Apple Maps on iPhone, Google Maps
/// elsewhere and on the web). False = nothing could open it.
Future<bool> openPlaceInMaps(String address) async {
  final apple = !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
  try {
    return await launchUrl(
      mapsUri(address, apple: apple),
      mode: LaunchMode.externalApplication,
    );
  } on Object {
    return false;
  }
}

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
/// role and practice, and «Open» / «Message» / a vCard.
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
          Row(
            children: [
              Expanded(
                child: _CardAction(
                  label: t.t('cases.files.openBtn'),
                  icon: AppIcons.person,
                  fg: fg,
                  onTap: () => context.push(AppRoutes.lawyer(card.username)),
                ),
              ),
              if (card.userId != me)
                Expanded(
                  child: _CardAction(
                    label: t.t('profile.action.message'),
                    icon: AppIcons.chatBubbleOutlineRounded,
                    fg: fg,
                    onTap: () => unawaited(
                      openDirectChat(context, ref, card.userId),
                    ),
                  ),
                ),
              Expanded(
                child: _CardAction(
                  label: t.t('card.vcf'),
                  icon: AppIcons.iosShareRounded,
                  fg: fg,
                  onTap: () => unawaited(shareContactVCard(context, ref, card)),
                ),
              ),
            ],
          ),
        ],
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
    return _CardFrame(
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
            onTap: () => unawaited(_open(context, t.t('card.map.failed'))),
          ),
        ],
      ),
    );
  }

  Future<void> _open(BuildContext context, String failed) async {
    if (!await openPlaceInMaps(address) && context.mounted) {
      showAppSnackBar(context, failed);
    }
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
            AppTextField(
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
