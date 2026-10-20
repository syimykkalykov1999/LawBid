import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/shared/domain/payment_page_launch_mode.dart';

/// Owner 2026-10-20 — the stars balance: top up (the payment page is on the
/// web, no store purchase), gifts I received, the history.
class StarsScreen extends ConsumerStatefulWidget {
  const StarsScreen({super.key});

  @override
  ConsumerState<StarsScreen> createState() => _StarsScreenState();
}

class _StarsScreenState extends ConsumerState<StarsScreen>
    with WidgetsBindingObserver {
  String? _purchaseId;
  String? _buying;
  final List<StarLedgerItem> _items = [];
  String? _next;
  bool _loaded = false;
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _history(reset: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _history({bool reset = false}) async {
    if (_loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await ref
          .read(starsRepositoryProvider)
          .history(cursor: reset ? null : _next);
      if (!mounted) return;
      setState(() {
        if (reset) _items.clear();
        _items.addAll(page.items);
        _next = page.next;
        _loaded = true;
      });
    } on Object {
      if (mounted) setState(() => _loaded = true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  /// Back from the payment page: ask the server what happened.
  @override
  Future<void> didChangeAppLifecycleState(AppLifecycleState state) async {
    final id = _purchaseId;
    if (state != AppLifecycleState.resumed || id == null) return;
    final t = ref.read(translatorProvider);
    try {
      final r = await ref.read(starsRepositoryProvider).purchase(id);
      if (r.paid && mounted) {
        showAppSnackBar(context, t.t('stars.paid', {'n': '${r.stars}'}));
      }
      if (r.paid || r.canceled) _purchaseId = null;
    } on Object {
      // The balance below shows the truth on the next read.
    }
    ref.invalidate(starsOverviewProvider);
    unawaited(_history(reset: true));
  }

  Future<void> _buy(String packId) async {
    final t = ref.read(translatorProvider);
    setState(() => _buying = packId);
    try {
      final r = await ref.read(starsRepositoryProvider).buy(packId);
      _purchaseId = r.purchaseId;
      final url = Uri.tryParse(r.checkoutUrl);
      if ((url == null || !await openPaymentPage(url)) && mounted) {
        showAppSnackBar(context, t.t('plans.cantOpen'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _buying = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final f = ref.watch(l10nFormatsProvider);
    final data = ref.watch(starsOverviewProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('stars.title'))),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: AppButton(
            label: t.t('common.retry'),
            variant: AppButtonVariant.secondary,
            onPressed: () => ref.invalidate(starsOverviewProvider),
          ),
        ),
        data: (d) => ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.goldTint,
                borderRadius: BorderRadius.circular(AppRadii.card),
              ),
              child: Column(
                children: [
                  Text(
                    t.t('stars.balance'),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Semantics(
                    label: t.t('stars.balanceIs', {'n': '${d.balance}'}),
                    excludeSemantics: true,
                    child: Text(
                      '${d.balance} ⭐',
                      key: const ValueKey('stars-balance'),
                      style: type.titleLarge.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('stars.hint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('stars.topup'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final p in d.packs) ...[
              _PackRow(
                pack: p,
                busy: _buying == p.id,
                onBuy: () => _buy(p.id),
                t: t,
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            if (d.packs.isEmpty)
              Text(
                t.t('stars.none'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            const SizedBox(height: AppSpacing.md),
            AppListRow(
              key: const ValueKey('stars-my-gifts'),
              icon: AppIcons.giftOutlined,
              label: t.t('stars.myGifts'),
              subtitle: t.t('stars.myGifts.hint', {
                'percent': '${d.giftConvertPercent}',
              }),
              onTap: () => context.push(AppRoutes.myGifts),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('stars.history'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (!_loaded)
              const Center(child: CircularProgressIndicator())
            else if (_items.isEmpty)
              Text(
                t.t('stars.history.empty'),
                style: type.body.copyWith(color: colors.textSecondary),
              )
            else
              for (final i in _items) _LedgerRow(item: i, t: t, f: f),
            if (_next != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: AppButton(
                  label: t.t('stars.history.more'),
                  variant: AppButtonVariant.secondary,
                  isLoading: _loadingMore,
                  onPressed: _history,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PackRow extends StatelessWidget {
  const _PackRow({
    required this.pack,
    required this.busy,
    required this.onBuy,
    required this.t,
  });

  final StarPack pack;
  final bool busy;
  final VoidCallback onBuy;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${pack.stars} ⭐',
              style: type.titleMedium.copyWith(color: colors.text),
            ),
          ),
          // The apps show no money prices (owner 2026-10-20): only the web
          // build prints the amount, the payment page is on the web anyway.
          SizedBox(
            width: 132,
            child: AppButton(
              label:
                  kIsWeb ? _price(pack.priceCents) : t.t('stars.topup.short'),
              isLoading: busy,
              onPressed: onBuy,
            ),
          ),
        ],
      ),
    );
  }
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.item, required this.t, required this.f});

  final StarLedgerItem item;
  final Translator t;
  final L10nFormats f;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final plus = item.delta > 0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.t('stars.kind.${item.kind.name}'),
                  style: type.body.copyWith(color: colors.text),
                ),
                Text(
                  f.dateTime(item.createdAt),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          Text(
            '${plus ? '+' : ''}${item.delta} ⭐',
            style: type.body.copyWith(
              color: plus ? colors.successText : colors.text,
            ),
          ),
        ],
      ),
    );
  }
}

String _price(int cents) =>
    '\$${(cents / 100).toStringAsFixed(cents % 100 == 0 ? 0 : 2)}';
