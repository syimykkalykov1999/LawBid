// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_attorney_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminAttorneyCardDto _$AdminAttorneyCardDtoFromJson(
  Map<String, dynamic> json,
) => AdminAttorneyCardDto(
  username: json['username'] as String,
  firmName: json['firmName'] as String?,
  verificationStatus: json['verificationStatus'] as String,
  verifiedAt: json['verifiedAt'] == null
      ? null
      : DateTime.parse(json['verifiedAt'] as String),
  ratingAvg: json['ratingAvg'] as num,
  ratingCount: (json['ratingCount'] as num).toInt(),
  followersCount: (json['followersCount'] as num).toInt(),
  postsCount: (json['postsCount'] as num).toInt(),
  licenses: (json['licenses'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  subscription: json['subscription'] == null
      ? null
      : AdminUserSubscriptionDto.fromJson(
          json['subscription'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$AdminAttorneyCardDtoToJson(
  AdminAttorneyCardDto instance,
) => <String, dynamic>{
  'username': instance.username,
  'firmName': ?instance.firmName,
  'verificationStatus': instance.verificationStatus,
  'verifiedAt': ?instance.verifiedAt?.toIso8601String(),
  'ratingAvg': instance.ratingAvg,
  'ratingCount': instance.ratingCount,
  'followersCount': instance.followersCount,
  'postsCount': instance.postsCount,
  'licenses': instance.licenses,
  'subscription': ?instance.subscription?.toJson(),
};
