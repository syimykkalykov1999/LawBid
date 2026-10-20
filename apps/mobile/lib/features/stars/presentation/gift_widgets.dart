import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-20 — gifts: the picture, the picker under the chat input,
/// the confirmation sheet, the chat bubble and the profile showcase.
class GiftImage extends StatelessWidget {
  const GiftImage({required this.url, this.size = 72, super.key});

  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final u = url;
    return SizedBox.square(
      dimension: size,
      child: u == null
          ? Center(
              child: AppIcon(
                AppIcons.giftOutlined,
                size: size * 0.5,
                color: colors.gold,
              ),
            )
          : CachedNetworkImage(
              imageUrl: u,
              memCacheWidth: decodeWidthFor(size),
              fit: BoxFit.contain,
              fadeInDuration: const Duration(milliseconds: 120),
              errorWidget: (_, __, ___) => Center(
                child: AppIcon(
                  AppIcons.giftOutlined,
                  size: size * 0.5,
                  color: colors.gold,
                ),
              ),
            ),
    );
  }
}

/// The «Подарки» tab of the sticker panel: the catalog as a grid.
class GiftPicker extends ConsumerWidget {
  const GiftPicker({required this.onGift, super.key});

  final ValueChanged<Gift> onGift;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final gifts = ref.watch(giftCatalogProvider);
    final balance = ref.watch(starsOverviewProvider).value?.balance;
    return gifts.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, __) => Center(
        child: AppButton(
          label: t.t('common.retry'),
          variant: AppButtonVariant.secondary,
          onPressed: () => ref.invalidate(giftCatalogProvider),
        ),
      ),
      data: (list) => list.isEmpty
          ? Center(
              child: Text(
                t.t('stars.gifts.empty'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            )
          : Column(
              children: [
                if (balance != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.md,
                      AppSpacing.sm,
                      AppSpacing.md,
                      0,
                    ),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        t.t('stars.send.balance', {'n': '$balance'}),
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: GridView.builder(
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 96,
                      mainAxisSpacing: AppSpacing.xs,
                      crossAxisSpacing: AppSpacing.xs,
                      childAspectRatio: 0.82,
                    ),
                    itemCount: list.length,
                    itemBuilder: (_, i) => _GiftCell(
                      gift: list[i],
                      onTap: () => onGift(list[i]),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _GiftCell extends StatelessWidget {
  const _GiftCell({required this.gift, required this.onTap});

  final Gift gift;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: '${gift.title}, ${gift.priceStars} ⭐',
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Column(
          children: [
            Expanded(child: GiftImage(url: gift.url, size: 64)),
            const SizedBox(height: 2),
            Text(
              '${gift.priceStars} ⭐',
              maxLines: 1,
              style: type.caption.copyWith(color: colors.goldDark),
            ),
          ],
        ),
      ),
    );
  }
}

/// Sends the gift; throws like the API calls do (the sheet shows it).
typedef GiftSender = Future<void> Function(GiftDraft draft);

/// What the sender typed in the sheet.
@immutable
class GiftDraft {
  const GiftDraft({
    required this.note,
    required this.anonymous,
    required this.clientMessageId,
  });

  final String? note;
  final bool anonymous;

  /// The same for every try of one sheet: a retry is never charged twice.
  final String clientMessageId;
}

/// «Подарить»: the gift, an optional note, the price and the balance. With
/// too few stars the button leads to the top-up.
Future<bool> showGiftSheet(
  BuildContext context, {
  required Gift gift,
  required GiftSender onSend,
  bool allowAnonymous = false,
}) async {
  final sent = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _GiftSheet(
      gift: gift,
      onSend: onSend,
      allowAnonymous: allowAnonymous,
    ),
  );
  return sent ?? false;
}

class _GiftSheet extends ConsumerStatefulWidget {
  const _GiftSheet({
    required this.gift,
    required this.onSend,
    required this.allowAnonymous,
  });

  final Gift gift;
  final GiftSender onSend;
  final bool allowAnonymous;

  @override
  ConsumerState<_GiftSheet> createState() => _GiftSheetState();
}

class _GiftSheetState extends ConsumerState<_GiftSheet> {
  final _note = TextEditingController();
  // One key per opened sheet: a retry after a lost answer is not charged
  // twice.
  final _cmid = newClientMessageId();
  bool _anonymous = false;
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final note = _note.text.trim();
      await widget.onSend(
        GiftDraft(
          note: note.isEmpty ? null : note,
          anonymous: _anonymous,
          clientMessageId: _cmid,
        ),
      );
      ref.invalidate(starsOverviewProvider);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      final low =
          e is ApiException && e.code == ApiErrorCodes.insufficientStars;
      showAppSnackBar(
        context,
        errorText(t, e),
        actionLabel: low ? t.t('stars.topup') : null,
        onAction: low ? _topUp : null,
      );
      if (low) ref.invalidate(starsOverviewProvider);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _topUp() {
    final router = GoRouter.of(context);
    Navigator.of(context).pop(false);
    router.push(AppRoutes.stars);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final g = widget.gift;
    final balance = ref.watch(starsOverviewProvider).value?.balance;
    final enough = balance == null || balance >= g.priceStars;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.md),
            Center(child: GiftImage(url: g.url, size: 120)),
            const SizedBox(height: AppSpacing.sm),
            Text(
              g.title,
              textAlign: TextAlign.center,
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            if (balance != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                enough
                    ? t.t('stars.send.balance', {'n': '$balance'})
                    : t.t('stars.send.notEnough', {'n': '${g.priceStars}'}),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(
                  color: enough ? colors.textSecondary : colors.dangerText,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _note,
              hintText: t.t('stars.send.note'),
              semanticLabel: t.t('stars.send.note'),
              maxLength: 120,
            ),
            if (widget.allowAnonymous)
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _anonymous,
                onChanged: (v) => setState(() => _anonymous = v),
                title: Text(
                  t.t('stars.send.anonymous'),
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            if (enough)
              AppButton(
                key: const ValueKey('gift-send'),
                label: t.t('stars.send.action', {'n': '${g.priceStars}'}),
                isLoading: _busy,
                onPressed: _send,
              )
            else
              AppButton(
                key: const ValueKey('gift-topup'),
                label: t.t('stars.topup'),
                onPressed: _topUp,
              ),
          ],
        ),
      ),
    );
  }
}

/// The gift inside a chat bubble.
class GiftMessageBody extends StatelessWidget {
  const GiftMessageBody({
    required this.send,
    required this.note,
    required this.color,
    required this.style,
    super.key,
  });

  final GiftSend send;
  final String note;
  final Color color;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GiftImage(url: send.gift.url, size: 132),
        Text(
          send.gift.title,
          textAlign: TextAlign.center,
          style: style.copyWith(color: color, fontWeight: FontWeight.w600),
        ),
        if (note.trim().isNotEmpty) ...[
          const SizedBox(height: 2),
          Text(
            note,
            textAlign: TextAlign.center,
            style: style.copyWith(color: color),
          ),
        ],
      ],
    );
  }
}

/// «Подарки» on a profile: the strip of received gifts and «Подарить».
class GiftShowcase extends ConsumerWidget {
  const GiftShowcase({required this.userId, this.isMe = false, super.key});

  final String userId;
  final bool isMe;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(starsEnabledProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final list = ref.watch(giftShowcaseProvider(userId)).value ?? const [];
    final shown = [
      for (final s in list)
        if (s.shown && !s.converted) s,
    ];
    final canGive = !isMe && !ref.watch(isAssistantProvider);
    if (shown.isEmpty && !canGive) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (shown.isNotEmpty)
                Expanded(
                  child: Text(
                    t.t('stars.profile.title'),
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                )
              else
                const Spacer(),
              if (canGive)
                TextButton.icon(
                  key: const ValueKey('profile-give-gift'),
                  onPressed: () => showGiftCatalogSheet(context, ref, userId),
                  icon: AppIcon(AppIcons.giftOutlined, color: colors.goldDark),
                  label: Text(
                    t.t('stars.profile.give'),
                    style: TextStyle(color: colors.goldDark),
                  ),
                ),
            ],
          ),
          if (shown.isNotEmpty)
            SizedBox(
              height: 76,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: shown.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(width: AppSpacing.sm),
                itemBuilder: (_, i) => Semantics(
                  label: shown[i].gift.title,
                  excludeSemantics: true,
                  child: GiftImage(url: shown[i].gift.url),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Catalog in a sheet → the gift sheet → a gift to the profile of [userId].
Future<void> showGiftCatalogSheet(
  BuildContext context,
  WidgetRef ref,
  String userId,
) async {
  final gift = await showAppBottomSheet<Gift>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SizedBox(
      height: MediaQuery.sizeOf(ctx).height * 0.55,
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.md),
          const AppSheetHandle(),
          Expanded(child: GiftPicker(onGift: (g) => Navigator.of(ctx).pop(g))),
        ],
      ),
    ),
  );
  if (gift == null || !context.mounted) return;
  final t = ref.read(translatorProvider);
  final repo = ref.read(starsRepositoryProvider);
  final ok = await showGiftSheet(
    context,
    gift: gift,
    allowAnonymous: true,
    onSend: (d) async {
      await repo.sendToProfile(
        gift.id,
        userId,
        note: d.note,
        anonymous: d.anonymous,
      );
    },
  );
  if (ok && context.mounted) {
    showAppSnackBar(context, t.t('stars.send.done'));
    ref.invalidate(giftShowcaseProvider(userId));
  }
}

/// Short «From …» line of a received gift.
String giftFromText(Translator t, GiftSend s) {
  final name = s.senderName;
  return s.anonymous || name == null || name.isEmpty
      ? t.t('stars.gift.anonymous')
      : t.t('stars.gift.from', {'name': name});
}
