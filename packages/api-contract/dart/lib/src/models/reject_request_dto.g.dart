// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reject_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RejectRequestDto _$RejectRequestDtoFromJson(Map<String, dynamic> json) =>
    RejectRequestDto(
      rejectionCode: RejectRequestDtoRejectionCode.fromJson(
        json['rejectionCode'] as String,
      ),
      comment: json['comment'] as String?,
    );

Map<String, dynamic> _$RejectRequestDtoToJson(RejectRequestDto instance) =>
    <String, dynamic>{
      'rejectionCode': instance.rejectionCode.toJson(),
      'comment': ?instance.comment,
    };
