import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/stars/presentation/gift_names.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart';

/// Owner 2026-10-20 — gifts I received: show on / hide from my profile,
/// or turn into stars.
class MyGiftsScreen extends ConsumerStatefulWidget {
  const MyGiftsScreen({super.key});

  @override
  ConsumerState<MyGiftsScreen> createState() => _MyGiftsScreenState();
}

class _MyGiftsScreenState extends ConsumerState<MyGiftsScreen> {
  String? _busy;

  Future<void> _run(String id, Future<void> Function() action) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = id);
    try {
      await action();
      final me = ref.read(currentUserIdProvider);
      if (me != null) ref.invalidate(giftShowcaseProvider(me));
      ref.invalidate(starsOverviewProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _convert(GiftSend s, int percent) async {
    final t = ref.read(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final stars = (s.gift.priceStars * percent / 100).floor();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AppAlertDialog(
        backgroundColor: colors.sheet,
        title: Text(t.t('stars.gift.convert.title')),
        content: Text(
          t.t('stars.gift.convert.message', {
            'n': '$stars',
            'percent': '$percent',
          }),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(t.t('stars.gift.convert')),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(s.id, () async {
      final r = await ref.read(starsRepositoryProvider).convert(s.id);
      if (mounted) {
        showAppSnackBar(
          context,
          t.t('stars.gift.converted', {'n': '${r.stars}'}),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final f = ref.watch(l10nFormatsProvider);
    final me = ref.watch(currentUserIdProvider);
    final percent =
        ref.watch(starsOverviewProvider).value?.giftConvertPercent ?? 70;
    final data = me == null
        ? const AsyncValue<List<GiftSend>>.data([])
        : ref.watch(giftShowcaseProvider(me));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('stars.myGifts'))),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: AppButton(
            label: t.t('common.retry'),
            variant: AppButtonVariant.secondary,
            onPressed: () =>
                me == null ? null : ref.invalidate(giftShowcaseProvider(me)),
          ),
        ),
        data: (list) => list.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: Text(
                    t.t('stars.myGifts.empty'),
                    textAlign: TextAlign.center,
                    style: type.body.copyWith(color: colors.textSecondary),
                  ),
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                itemCount: list.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppSpacing.sm),
                itemBuilder: (_, i) => _GiftRow(
                  send: list[i],
                  busy: _busy == list[i].id,
                  percent: percent,
                  f: f,
                  onToggle: () => _run(
                    list[i].id,
                    () => ref
                        .read(starsRepositoryProvider)
                        .setShown(list[i].id, shown: !list[i].shown),
                  ),
                  onConvert: () => _convert(list[i], percent),
                ),
              ),
      ),
    );
  }
}

class _GiftRow extends ConsumerWidget {
  const _GiftRow({
    required this.send,
    required this.busy,
    required this.percent,
    required this.f,
    required this.onToggle,
    required this.onConvert,
  });

  final GiftSend send;
  final bool busy;
  final int percent;
  final L10nFormats f;
  final VoidCallback onToggle;
  final VoidCallback onConvert;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = send;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GiftImage(url: s.gift.url, size: 56),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      giftTitle(t, s.gift),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.text),
                    ),
                    Text(
                      '${giftFromText(t, s)} · ${f.date(s.createdAt)}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                    if ((s.note ?? '').isNotEmpty)
                      Text(
                        s.note!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(color: colors.text),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (s.converted)
            Text(
              t.t('stars.gift.convertedBadge', {'n': '${s.convertedStars}'}),
              style: type.bodySmall.copyWith(color: colors.successText),
            )
          else
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: s.shown
                        ? t.t('stars.gift.hide')
                        : t.t('stars.gift.show'),
                    variant: AppButtonVariant.secondary,
                    isLoading: busy,
                    onPressed: onToggle,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton(
                    label: t.t('stars.gift.convert'),
                    variant: AppButtonVariant.secondary,
                    onPressed: busy ? null : onConvert,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
