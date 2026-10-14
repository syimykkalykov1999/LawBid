// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/bid_pack_buy_envelope.dart';
import '../models/bid_pack_purchase_envelope.dart';
import '../models/bid_packs_envelope.dart';

part 'bid_packs_client.g.dart';

@RestApi()
abstract class BidPacksClient {
  factory BidPacksClient(Dio dio, {String? baseUrl}) = _BidPacksClient;

  /// Packs on offer and the credit balance
  @GET('/bid-packs')
  Future<BidPacksEnvelope> bidPacksOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start the payment for a pack
  @POST('/bid-packs/{packId}/buy')
  Future<BidPackBuyEnvelope> buyBidPack({
    @Path('packId') required String packId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A purchase after the payment page
  @GET('/bid-packs/purchases/{id}')
  Future<BidPackPurchaseEnvelope> getBidPackPurchase({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
