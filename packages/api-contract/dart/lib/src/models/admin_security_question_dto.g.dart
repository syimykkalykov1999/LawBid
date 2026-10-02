// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_security_question_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSecurityQuestionDto _$AdminSecurityQuestionDtoFromJson(
  Map<String, dynamic> json,
) => AdminSecurityQuestionDto(
  question: json['question'] as String,
  answer: json['answer'] as String,
);

Map<String, dynamic> _$AdminSecurityQuestionDtoToJson(
  AdminSecurityQuestionDto instance,
) => <String, dynamic>{
  'question': instance.question,
  'answer': instance.answer,
};
