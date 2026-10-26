// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vote_poll_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VotePollDto _$VotePollDtoFromJson(Map<String, dynamic> json) => VotePollDto(
  optionIds: (json['optionIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$VotePollDtoToJson(VotePollDto instance) =>
    <String, dynamic>{'optionIds': instance.optionIds};
