// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_qa_answer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminQaAnswerDto _$AdminQaAnswerDtoFromJson(Map<String, dynamic> json) =>
    AdminQaAnswerDto(
      id: json['id'] as String,
      body: json['body'] as String,
      status: json['status'] as String,
      isBest: json['isBest'] as bool,
      likeCount: json['likeCount'] as num,
      attorney: AdminQaPersonDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminQaAnswerDtoToJson(AdminQaAnswerDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'body': instance.body,
      'status': instance.status,
      'isBest': instance.isBest,
      'likeCount': instance.likeCount,
      'attorney': instance.attorney.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
