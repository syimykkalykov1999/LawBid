// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forward_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ForwardResponseDto _$ForwardResponseDtoFromJson(Map<String, dynamic> json) =>
    ForwardResponseDto(
      results: (json['results'] as List<dynamic>)
          .map((e) => ForwardResultDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ForwardResponseDtoToJson(ForwardResponseDto instance) =>
    <String, dynamic>{
      'results': instance.results.map((e) => e.toJson()).toList(),
    };
