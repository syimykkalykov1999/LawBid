// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantMeDto _$AssistantMeDtoFromJson(Map<String, dynamic> json) =>
    AssistantMeDto(
      state: AssistantMeDtoState.fromJson(json['state'] as String),
      duties: (json['duties'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      membershipId: json['membershipId'] as String?,
      attorneyId: json['attorneyId'] as String?,
      attorneyName: json['attorneyName'] as String?,
      attorneyUsername: json['attorneyUsername'] as String?,
      attorneyAvatarUrl: json['attorneyAvatarUrl'] as String?,
    );

Map<String, dynamic> _$AssistantMeDtoToJson(AssistantMeDto instance) =>
    <String, dynamic>{
      'state': instance.state.toJson(),
      'membershipId': ?instance.membershipId,
      'attorneyId': ?instance.attorneyId,
      'attorneyName': ?instance.attorneyName,
      'attorneyUsername': ?instance.attorneyUsername,
      'attorneyAvatarUrl': ?instance.attorneyAvatarUrl,
      'duties': instance.duties,
    };
