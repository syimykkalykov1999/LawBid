// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gift_send_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GiftSendDto _$GiftSendDtoFromJson(Map<String, dynamic> json) => GiftSendDto(
  id: json['id'] as String,
  gift: GiftDto.fromJson(json['gift'] as Map<String, dynamic>),
  anonymous: json['anonymous'] as bool,
  shown: json['shown'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  senderId: json['senderId'] as String?,
  senderName: json['senderName'] as String?,
  note: json['note'] as String?,
  convertedStars: (json['convertedStars'] as num?)?.toInt(),
);

Map<String, dynamic> _$GiftSendDtoToJson(GiftSendDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'gift': instance.gift.toJson(),
      'senderId': ?instance.senderId,
      'senderName': ?instance.senderName,
      'anonymous': instance.anonymous,
      'note': ?instance.note,
      'shown': instance.shown,
      'convertedStars': ?instance.convertedStars,
      'createdAt': instance.createdAt.toIso8601String(),
    };
