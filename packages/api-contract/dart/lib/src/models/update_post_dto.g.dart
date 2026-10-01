// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePostDto _$UpdatePostDtoFromJson(Map<String, dynamic> json) =>
    UpdatePostDto(
      body: json['body'] as String,
      title: json['title'] as String?,
      practiceCode: json['practiceCode'] as String?,
    );

Map<String, dynamic> _$UpdatePostDtoToJson(UpdatePostDto instance) =>
    <String, dynamic>{
      'title': ?instance.title,
      'practiceCode': ?instance.practiceCode,
      'body': instance.body,
    };
