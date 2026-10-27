// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_attorney_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicAttorneyDto _$PublicAttorneyDtoFromJson(Map<String, dynamic> json) =>
    PublicAttorneyDto(
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      firmNames: (json['firmNames'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      languages: (json['languages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      ratingAvg: json['ratingAvg'] as num,
      ratingCount: json['ratingCount'] as num,
      trustBadge: json['trustBadge'] as bool,
      photoUrl: json['photoUrl'] as String?,
      practiceAreas: (json['practiceAreas'] as List<dynamic>)
          .map((e) => PublicPracticeDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      licensedStates: (json['licensedStates'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      bio: json['bio'] as String?,
    );

Map<String, dynamic> _$PublicAttorneyDtoToJson(PublicAttorneyDto instance) =>
    <String, dynamic>{
      'username': instance.username,
      'displayName': instance.displayName,
      'bio': ?instance.bio,
      'firmNames': instance.firmNames,
      'languages': instance.languages,
      'ratingAvg': instance.ratingAvg,
      'ratingCount': instance.ratingCount,
      'trustBadge': instance.trustBadge,
      'photoUrl': ?instance.photoUrl,
      'practiceAreas': instance.practiceAreas.map((e) => e.toJson()).toList(),
      'licensedStates': instance.licensedStates,
      'updatedAt': instance.updatedAt.toIso8601String(),
    };
