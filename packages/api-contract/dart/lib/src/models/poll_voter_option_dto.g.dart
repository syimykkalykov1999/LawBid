// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'poll_voter_option_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PollVoterOptionDto _$PollVoterOptionDtoFromJson(Map<String, dynamic> json) =>
    PollVoterOptionDto(
      optionId: json['optionId'] as String,
      voters: (json['voters'] as List<dynamic>)
          .map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PollVoterOptionDtoToJson(PollVoterOptionDto instance) =>
    <String, dynamic>{
      'optionId': instance.optionId,
      'voters': instance.voters.map((e) => e.toJson()).toList(),
    };
