import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// DTO → model for gifts (the chat mapper uses it too).
abstract final class StarsMappers {
  static Gift gift(api.GiftDto d) =>
      Gift(
        id: d.id,
        title: d.title,
        priceStars: d.priceStars,
        url: d.url,
        code: d.code,
      );

  static GiftSend send(api.GiftSendDto d) => GiftSend(
        id: d.id,
        gift: gift(d.gift),
        senderId: d.senderId,
        senderName: d.senderName,
        anonymous: d.anonymous,
        note: d.note,
        shown: d.shown,
        convertedStars: d.convertedStars,
        createdAt: d.createdAt,
      );
}
