// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/convert_gift_result_envelope.dart';
import '../models/gift_list_envelope.dart';
import '../models/gift_send_envelope.dart';
import '../models/gift_send_list_envelope.dart';
import '../models/send_profile_gift_dto.dart';
import '../models/set_gift_shown_dto.dart';
import '../models/star_ledger_item_list_envelope.dart';
import '../models/stars_buy_envelope.dart';
import '../models/stars_overview_envelope.dart';
import '../models/stars_purchase_envelope.dart';

part 'stars_client.g.dart';

@RestApi()
abstract class StarsClient {
  factory StarsClient(Dio dio, {String? baseUrl}) = _StarsClient;

  /// Stars balance and the packs on offer
  @GET('/stars')
  Future<StarsOverviewEnvelope> starsOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// My stars history, newest first
  @GET('/stars/history')
  Future<StarLedgerItemListEnvelope> starsHistory({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start the payment (web page) for a stars pack
  @POST('/stars/packs/{packId}/buy')
  Future<StarsBuyEnvelope> buyStars({
    @Path('packId') required String packId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A stars purchase after the payment page
  @GET('/stars/purchases/{id}')
  Future<StarsPurchaseEnvelope> getStarsPurchase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The gift catalog
  @GET('/stars/gifts')
  Future<GiftListEnvelope> listGifts({@Extras() Map<String, dynamic>? extras});

  /// Give a gift to a profile (paid in stars)
  @POST('/stars/gifts/{giftId}/send')
  Future<GiftSendEnvelope> sendGiftToProfile({
    @Path('giftId') required String giftId,
    @Body() required SendProfileGiftDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A profile's gifts (the owner sees all of theirs)
  @GET('/stars/users/{id}/gifts')
  Future<GiftSendListEnvelope> giftShowcase({
    @Path('id') required String id,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show a received gift on my profile, or hide it
  @PATCH('/stars/received-gifts/{id}')
  Future<void> setGiftShown({
    @Path('id') required String id,
    @Body() required SetGiftShownDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn a received gift into stars
  @POST('/stars/received-gifts/{id}/convert')
  Future<ConvertGiftResultEnvelope> convertGift({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
