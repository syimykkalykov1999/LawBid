// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_attorney_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidAttorneySummaryDto _$BidAttorneySummaryDtoFromJson(
  Map<String, dynamic> json,
) => BidAttorneySummaryDto(
  id: json['id'] as String,
  username: json['username'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  avatarUrl256: json['avatarUrl256'] as String?,
  verifiedBadge: json['verifiedBadge'] as bool,
  rating: RatingDto.fromJson(json['rating'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BidAttorneySummaryDtoToJson(
  BidAttorneySummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'avatarUrl256': ?instance.avatarUrl256,
  'verifiedBadge': instance.verifiedBadge,
  'rating': instance.rating.toJson(),
};
