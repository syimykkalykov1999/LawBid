// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_client_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicClientProfileDto _$PublicClientProfileDtoFromJson(
  Map<String, dynamic> json,
) => PublicClientProfileDto(
  id: json['id'] as String,
  username: json['username'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  state: StateRefDto.fromJson(json['state'] as Map<String, dynamic>),
  memberSince: json['memberSince'] as String,
  isSelf: json['isSelf'] as bool,
  verifiedBadge: json['verifiedBadge'] as bool,
  isBlocked: json['isBlocked'] as bool,
  hasBlockedMe: json['hasBlockedMe'] as bool,
  postsCount: (json['postsCount'] as num).toInt(),
  followersCount: (json['followersCount'] as num).toInt(),
  followingCount: (json['followingCount'] as num).toInt(),
  isFollowing: json['isFollowing'] as bool,
  canSeeReviews: json['canSeeReviews'] as bool,
  ratingCount: (json['ratingCount'] as num).toInt(),
  ratingAvg: json['ratingAvg'] as num?,
);

Map<String, dynamic> _$PublicClientProfileDtoToJson(
  PublicClientProfileDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'avatarUrl': ?instance.avatarUrl,
  'state': instance.state.toJson(),
  'memberSince': instance.memberSince,
  'isSelf': instance.isSelf,
  'verifiedBadge': instance.verifiedBadge,
  'isBlocked': instance.isBlocked,
  'hasBlockedMe': instance.hasBlockedMe,
  'postsCount': instance.postsCount,
  'followersCount': instance.followersCount,
  'followingCount': instance.followingCount,
  'isFollowing': instance.isFollowing,
  'canSeeReviews': instance.canSeeReviews,
  'ratingAvg': ?instance.ratingAvg,
  'ratingCount': instance.ratingCount,
};
