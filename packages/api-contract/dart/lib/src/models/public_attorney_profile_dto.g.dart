// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_attorney_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicAttorneyProfileDto _$PublicAttorneyProfileDtoFromJson(
  Map<String, dynamic> json,
) => PublicAttorneyProfileDto(
  id: json['id'] as String,
  username: json['username'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  bio: json['bio'] as String?,
  firmName: json['firmName'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  avatarUrl256: json['avatarUrl256'] as String?,
  languages: (json['languages'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  verifiedBadge: json['verifiedBadge'] as bool,
  licensedStates: (json['licensedStates'] as List<dynamic>)
      .map((e) => StateRefDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  practiceAreas: (json['practiceAreas'] as List<dynamic>)
      .map((e) => SelectedPracticeAreaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  rating: RatingDto.fromJson(json['rating'] as Map<String, dynamic>),
  counters: ProfileCountersDto.fromJson(
    json['counters'] as Map<String, dynamic>,
  ),
  isSelf: json['isSelf'] as bool,
  isFollowing: json['isFollowing'] as bool,
);

Map<String, dynamic> _$PublicAttorneyProfileDtoToJson(
  PublicAttorneyProfileDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'bio': ?instance.bio,
  'firmName': ?instance.firmName,
  'avatarUrl': ?instance.avatarUrl,
  'avatarUrl256': ?instance.avatarUrl256,
  'languages': instance.languages,
  'verifiedBadge': instance.verifiedBadge,
  'licensedStates': instance.licensedStates.map((e) => e.toJson()).toList(),
  'practiceAreas': instance.practiceAreas.map((e) => e.toJson()).toList(),
  'rating': instance.rating.toJson(),
  'counters': instance.counters.toJson(),
  'isSelf': instance.isSelf,
  'isFollowing': instance.isFollowing,
};
