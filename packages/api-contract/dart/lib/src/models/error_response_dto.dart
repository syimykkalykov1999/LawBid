// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'error_body_dto.dart';

part 'error_response_dto.g.dart';

@JsonSerializable()
class ErrorResponseDto {
  const ErrorResponseDto({required this.error});

  factory ErrorResponseDto.fromJson(Map<String, Object?> json) =>
      _$ErrorResponseDtoFromJson(json);

  final ErrorBodyDto error;

  Map<String, Object?> toJson() => _$ErrorResponseDtoToJson(this);
}
