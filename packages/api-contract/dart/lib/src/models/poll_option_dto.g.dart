// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'poll_option_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PollOptionDto _$PollOptionDtoFromJson(Map<String, dynamic> json) =>
    PollOptionDto(
      id: json['id'] as String,
      text: json['text'] as String,
      votes: json['votes'] as num,
      percent: json['percent'] as num,
      voted: json['voted'] as bool,
      recentVoters: (json['recentVoters'] as List<dynamic>)
          .map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PollOptionDtoToJson(PollOptionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'text': instance.text,
      'votes': instance.votes,
      'percent': instance.percent,
      'voted': instance.voted,
      'recentVoters': instance.recentVoters.map((e) => e.toJson()).toList(),
    };
