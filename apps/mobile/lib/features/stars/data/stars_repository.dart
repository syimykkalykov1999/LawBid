import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 — the stars balance, the packs and the history.
class StarsRepository {
  StarsRepository(Dio dio) : _stars = api.StarsClient(dio);

  final api.StarsClient _stars;

  Future<StarsOverview> overview() async {
    final d = (await guardApiCall(_stars.starsOverview)).data;
    return StarsOverview(
      enabled: d.enabled,
      balance: d.balance,
      reactionStars: d.reactionStars,
      premiumReactions: d.premiumReactions,
      freeReactions: d.freeReactions,
      packs: [
        for (final p in d.packs)
          StarPack(id: p.id, stars: p.stars, priceCents: p.priceCents),
      ],
    );
  }

  Future<({List<StarLedgerItem> items, String? next})> history({
    String? cursor,
  }) async {
    final r = await guardApiCall(() => _stars.starsHistory(cursor: cursor));
    return (
      items: [
        for (final i in r.data)
          StarLedgerItem(
            id: i.id,
            delta: i.delta,
            balanceAfter: i.balanceAfter,
            kind: switch (i.kind) {
              api.StarLedgerItemDtoKind.topup => StarLedgerKind.topup,
              api.StarLedgerItemDtoKind.stickerPack =>
                StarLedgerKind.stickerPack,
              api.StarLedgerItemDtoKind.adminGrant => StarLedgerKind.adminGrant,
              api.StarLedgerItemDtoKind.refund => StarLedgerKind.refund,
              api.StarLedgerItemDtoKind.boost => StarLedgerKind.boost,
              api.StarLedgerItemDtoKind.boostRefund =>
                StarLedgerKind.boostRefund,
              api.StarLedgerItemDtoKind.reaction => StarLedgerKind.reaction,
              _ => StarLedgerKind.other,
            },
            note: i.note,
            createdAt: i.createdAt,
          ),
      ],
      next: r.meta?.nextCursor,
    );
  }

  /// Starts the payment; the caller opens `checkoutUrl` in the browser.
  Future<({String purchaseId, String checkoutUrl})> buy(String packId) async {
    final d = (await guardApiCall(
      () => _stars.buyStars(
        packId: packId,
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return (purchaseId: d.purchaseId, checkoutUrl: d.checkoutUrl);
  }

  Future<StarsPurchaseResult> purchase(String id) async {
    final d = (await guardApiCall(() => _stars.getStarsPurchase(id: id))).data;
    return StarsPurchaseResult(
      paid: d.status == api.StarsPurchaseDtoStatus.paid,
      canceled: d.status == api.StarsPurchaseDtoStatus.canceled,
      stars: d.stars,
      balance: d.balance,
    );
  }
}
