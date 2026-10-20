// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'question_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuestionDto _$QuestionDtoFromJson(Map<String, dynamic> json) => QuestionDto(
  id: json['id'] as String,
  title: json['title'] as String,
  body: json['body'] as String,
  isAnonymous: json['isAnonymous'] as bool,
  isMine: json['isMine'] as bool,
  answerCount: (json['answerCount'] as num).toInt(),
  canAnswer: json['canAnswer'] as bool,
  createdAt: json['createdAt'] as String,
  practiceArea: json['practiceArea'] == null
      ? null
      : QaPracticeAreaDto.fromJson(
          json['practiceArea'] as Map<String, dynamic>,
        ),
  state: json['state'] == null
      ? null
      : QaStateDto.fromJson(json['state'] as Map<String, dynamic>),
  author: json['author'] == null
      ? null
      : QaPersonDto.fromJson(json['author'] as Map<String, dynamic>),
  bestAnswerId: json['bestAnswerId'] as String?,
  myAnswerId: json['myAnswerId'] as String?,
);

Map<String, dynamic> _$QuestionDtoToJson(QuestionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'body': instance.body,
      'practiceArea': ?instance.practiceArea?.toJson(),
      'state': ?instance.state?.toJson(),
      'isAnonymous': instance.isAnonymous,
      'author': ?instance.author?.toJson(),
      'isMine': instance.isMine,
      'answerCount': instance.answerCount,
      'bestAnswerId': ?instance.bestAnswerId,
      'myAnswerId': ?instance.myAnswerId,
      'canAnswer': instance.canAnswer,
      'createdAt': instance.createdAt,
    };
