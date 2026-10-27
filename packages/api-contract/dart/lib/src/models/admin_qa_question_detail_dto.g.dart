// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_qa_question_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminQaQuestionDetailDto _$AdminQaQuestionDetailDtoFromJson(
  Map<String, dynamic> json,
) => AdminQaQuestionDetailDto(
  id: json['id'] as String,
  title: json['title'] as String,
  body: json['body'] as String,
  status: json['status'] as String,
  isAnonymous: json['isAnonymous'] as bool,
  answerCount: json['answerCount'] as num,
  bestAnswerId: json['bestAnswerId'] as String?,
  stateCode: json['stateCode'] as String?,
  practiceArea: json['practiceArea'] as String?,
  author: AdminQaPersonDto.fromJson(json['author'] as Map<String, dynamic>),
  safetyFlags: (json['safetyFlags'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  answers: (json['answers'] as List<dynamic>)
      .map((e) => AdminQaAnswerDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AdminQaQuestionDetailDtoToJson(
  AdminQaQuestionDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'body': instance.body,
  'status': instance.status,
  'isAnonymous': instance.isAnonymous,
  'answerCount': instance.answerCount,
  'bestAnswerId': ?instance.bestAnswerId,
  'stateCode': ?instance.stateCode,
  'practiceArea': ?instance.practiceArea,
  'author': instance.author.toJson(),
  'safetyFlags': instance.safetyFlags,
  'createdAt': instance.createdAt.toIso8601String(),
  'answers': instance.answers.map((e) => e.toJson()).toList(),
};
