// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'answer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnswerDto _$AnswerDtoFromJson(Map<String, dynamic> json) => AnswerDto(
  id: json['id'] as String,
  questionId: json['questionId'] as String,
  attorney: QaPersonDto.fromJson(json['attorney'] as Map<String, dynamic>),
  body: json['body'] as String,
  likeCount: (json['likeCount'] as num).toInt(),
  likedByMe: json['likedByMe'] as bool,
  isBest: json['isBest'] as bool,
  isMine: json['isMine'] as bool,
  createdAt: json['createdAt'] as String,
  updatedAt: json['updatedAt'] as String,
);

Map<String, dynamic> _$AnswerDtoToJson(AnswerDto instance) => <String, dynamic>{
  'id': instance.id,
  'questionId': instance.questionId,
  'attorney': instance.attorney.toJson(),
  'body': instance.body,
  'likeCount': instance.likeCount,
  'likedByMe': instance.likedByMe,
  'isBest': instance.isBest,
  'isMine': instance.isMine,
  'createdAt': instance.createdAt,
  'updatedAt': instance.updatedAt,
};
