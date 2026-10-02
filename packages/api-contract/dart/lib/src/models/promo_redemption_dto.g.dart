// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_redemption_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoRedemptionDto _$PromoRedemptionDtoFromJson(Map<String, dynamic> json) =>
    PromoRedemptionDto(
      id: json['id'] as String,
      promoId: json['promoId'] as String,
      userId: json['userId'] as String,
      user: json['user'] == null
          ? null
          : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
      amountOffCents: (json['amountOffCents'] as num?)?.toInt(),
      paymentId: json['paymentId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$PromoRedemptionDtoToJson(PromoRedemptionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'promoId': instance.promoId,
      'userId': instance.userId,
      'user': ?instance.user?.toJson(),
      'amountOffCents': ?instance.amountOffCents,
      'paymentId': ?instance.paymentId,
      'createdAt': instance.createdAt.toIso8601String(),
    };
