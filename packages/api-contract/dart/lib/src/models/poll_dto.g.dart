// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'poll_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PollDto _$PollDtoFromJson(Map<String, dynamic> json) => PollDto(
  id: json['id'] as String,
  question: json['question'] as String,
  multiple: json['multiple'] as bool,
  anonymous: json['anonymous'] as bool,
  closed: json['closed'] as bool,
  creatorId: json['creatorId'] as String,
  totalVoters: json['totalVoters'] as num,
  options: (json['options'] as List<dynamic>)
      .map((e) => PollOptionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  myOptionIds: (json['myOptionIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  closedAt: json['closedAt'] == null
      ? null
      : DateTime.parse(json['closedAt'] as String),
);

Map<String, dynamic> _$PollDtoToJson(PollDto instance) => <String, dynamic>{
  'id': instance.id,
  'question': instance.question,
  'multiple': instance.multiple,
  'anonymous': instance.anonymous,
  'closed': instance.closed,
  'closedAt': ?instance.closedAt?.toIso8601String(),
  'creatorId': instance.creatorId,
  'totalVoters': instance.totalVoters,
  'options': instance.options.map((e) => e.toJson()).toList(),
  'myOptionIds': instance.myOptionIds,
};
