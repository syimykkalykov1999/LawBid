// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactCardDto _$ContactCardDtoFromJson(Map<String, dynamic> json) =>
    ContactCardDto(
      userId: json['userId'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      verifiedBadge: json['verifiedBadge'] as bool,
      firmNames: (json['firmNames'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      practiceKeys: (json['practiceKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      licensedStates: (json['licensedStates'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      avatarUrl: json['avatarUrl'] as String?,
    );

Map<String, dynamic> _$ContactCardDtoToJson(ContactCardDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'username': instance.username,
      'displayName': instance.displayName,
      'avatarUrl': ?instance.avatarUrl,
      'verifiedBadge': instance.verifiedBadge,
      'firmNames': instance.firmNames,
      'practiceKeys': instance.practiceKeys,
      'licensedStates': instance.licensedStates,
    };
