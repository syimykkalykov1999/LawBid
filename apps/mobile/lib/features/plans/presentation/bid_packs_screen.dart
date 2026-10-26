import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/payments/pay_page_look.dart';
import 'package:lawbid/shared/domain/payment_page_launch_mode.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-14: offers bought on top of the plan's monthly limit.
final bidPacksProvider = FutureProvider.autoDispose<api.BidPacksDto>(
  (ref) async => (await guardApiCall(
    () => api.BidPacksClient(ref.watch(dioProvider)).bidPacksOverview(),
  ))
      .data,
);

class BidPacksScreen extends ConsumerStatefulWidget {
  const BidPacksScreen({super.key});

  @override
  ConsumerState<BidPacksScreen> createState() => _BidPacksScreenState();
}

class _BidPacksScreenState extends ConsumerState<BidPacksScreen>
    with WidgetsBindingObserver {
  String? _purchaseId;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Back from the payment page: ask the server what happened.
  @override
  Future<void> didChangeAppLifecycleState(AppLifecycleState state) async {
    final id = _purchaseId;
    if (state != AppLifecycleState.resumed || id == null) return;
    try {
      await guardApiCall(
        () => api.BidPacksClient(ref.read(dioProvider)).getBidPackPurchase(
          id: id,
        ),
      );
    } on Object {
      // The list below shows the truth on the next read.
    }
    if (!mounted) return;
    _purchaseId = null;
    ref.invalidate(bidPacksProvider);
  }

  Future<void> _buy(String packId) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final r = (await guardApiCall(
        () => api.BidPacksClient(ref.read(dioProvider)).buyBidPack(
          packId: packId,
        ),
      ))
          .data;
      _purchaseId = r.purchaseId;
      // Owner 2026-10-22: our card page, in the app's theme and language
      // (Safari on the iPhone: stars are never bought inside the iOS app).
      final url = Uri.tryParse(r.checkoutUrl);
      if ((url == null ||
              !await openPaymentPage(withAppPayPageLook(ref.read, url))) &&
          mounted) {
        showAppSnackBar(context, t.t('plans.cantOpen'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final data = ref.watch(bidPacksProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('packs.title'))),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: AppButton(
            label: t.t('common.retry'),
            variant: AppButtonVariant.secondary,
            onPressed: () => ref.invalidate(bidPacksProvider),
          ),
        ),
        data: (d) => ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            Text(
              t.t('packs.balance', {'n': '${d.balance}'}),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('packs.hint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            for (final p in d.packs) ...[
              Container(
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
                        t.t('packs.item', {'n': '${p.bids}'}),
                        style: type.body.copyWith(color: colors.text),
                      ),
                    ),
                    AppButton(
                      label: _price(p.priceCents),
                      isLoading: _busy,
                      onPressed: () => _buy(p.id),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            if (!d.enabled || d.packs.isEmpty)
              Text(
                t.t('packs.none'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
          ],
        ),
      ),
    );
  }
}

String _price(int cents) =>
    '\$${(cents / 100).toStringAsFixed(cents % 100 == 0 ? 0 : 2)}';
