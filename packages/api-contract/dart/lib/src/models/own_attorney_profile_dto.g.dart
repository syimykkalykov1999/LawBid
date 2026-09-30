// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'own_attorney_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnAttorneyProfileDto _$OwnAttorneyProfileDtoFromJson(
  Map<String, dynamic> json,
) => OwnAttorneyProfileDto(
  id: json['id'] as String,
  username: json['username'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  bio: json['bio'] as String?,
  firmName: json['firmName'] as String?,
  firms: (json['firms'] as List<dynamic>).map((e) => e as String).toList(),
  languages: (json['languages'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  verificationStatus: VerificationStatus.fromJson(
    json['verificationStatus'] as String,
  ),
  verifiedBadge: json['verifiedBadge'] as bool,
  nameMismatch: json['nameMismatch'] as bool,
  usernameChangedAt: json['usernameChangedAt'] == null
      ? null
      : DateTime.parse(json['usernameChangedAt'] as String),
  usernameNextChangeAt: json['usernameNextChangeAt'] == null
      ? null
      : DateTime.parse(json['usernameNextChangeAt'] as String),
  licenses: (json['licenses'] as List<dynamic>)
      .map((e) => OwnLicenseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  rating: RatingDto.fromJson(json['rating'] as Map<String, dynamic>),
  counters: ProfileCountersDto.fromJson(
    json['counters'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$OwnAttorneyProfileDtoToJson(
  OwnAttorneyProfileDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'bio': ?instance.bio,
  'firmName': ?instance.firmName,
  'firms': instance.firms,
  'languages': instance.languages,
  'verificationStatus': instance.verificationStatus.toJson(),
  'verifiedBadge': instance.verifiedBadge,
  'nameMismatch': instance.nameMismatch,
  'usernameChangedAt': ?instance.usernameChangedAt?.toIso8601String(),
  'usernameNextChangeAt': ?instance.usernameNextChangeAt?.toIso8601String(),
  'licenses': instance.licenses.map((e) => e.toJson()).toList(),
  'rating': instance.rating.toJson(),
  'counters': instance.counters.toJson(),
};
