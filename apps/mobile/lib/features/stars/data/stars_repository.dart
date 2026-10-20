import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/stars/domain/stars_mappers.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 — the stars balance, the gift catalog and gifts given.
class StarsRepository {
  StarsRepository(Dio dio)
      : _stars = api.StarsClient(dio),
        _chat = api.ChatClient(dio);

  final api.StarsClient _stars;
  final api.ChatClient _chat;

  Future<StarsOverview> overview() async {
    final d = (await guardApiCall(_stars.starsOverview)).data;
    return StarsOverview(
      enabled: d.enabled,
      balance: d.balance,
      giftConvertPercent: d.giftConvertPercent,
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
              api.StarLedgerItemDtoKind.giftSent => StarLedgerKind.giftSent,
              api.StarLedgerItemDtoKind.giftConverted =>
                StarLedgerKind.giftConverted,
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

  Future<List<Gift>> gifts() async => (await guardApiCall(_stars.listGifts))
      .data
      .map(StarsMappers.gift)
      .toList();

  Future<GiftSend> sendToProfile(
    String giftId,
    String recipientId, {
    String? note,
    bool anonymous = false,
  }) async =>
      StarsMappers.send(
        (await guardApiCall(
          () => _stars.sendGiftToProfile(
            giftId: giftId,
            body: api.SendProfileGiftDto(
              recipientId: recipientId,
              note: note,
              anonymous: anonymous,
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  /// A gift in a chat: a message of type `gift`, paid in stars. The server
  /// charges once per [clientMessageId].
  Future<api.MessageDto> sendInChat(
    String conversationId,
    String clientMessageId,
    String giftId, {
    String? note,
  }) async =>
      (await guardApiCall(
        () => _chat.sendMessage(
          id: conversationId,
          body: api.SendMessageDto(
            clientMessageId: clientMessageId,
            type: api.SendMessageType.gift,
            giftId: giftId,
            body: note,
          ),
        ),
      ))
          .data;

  Future<({List<GiftSend> items, String? next})> showcase(
    String userId, {
    String? cursor,
  }) async {
    final r = await guardApiCall(
      () => _stars.giftShowcase(id: userId, cursor: cursor),
    );
    return (
      items: r.data.map(StarsMappers.send).toList(),
      next: r.meta?.nextCursor
    );
  }

  Future<void> setShown(String sendId, {required bool shown}) => guardApiCall(
        () => _stars.setGiftShown(
          id: sendId,
          body: api.SetGiftShownDto(shown: shown),
        ),
      );

  Future<({int stars, int balance})> convert(String sendId) async {
    final d = (await guardApiCall(() => _stars.convertGift(id: sendId))).data;
    return (stars: d.stars, balance: d.balance);
  }
}
