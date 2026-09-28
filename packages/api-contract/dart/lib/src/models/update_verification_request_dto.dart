// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_verification_request_dto.g.dart';

@JsonSerializable()
class UpdateVerificationRequestDto {
  const UpdateVerificationRequestDto({required this.applicantComment});

  factory UpdateVerificationRequestDto.fromJson(Map<String, Object?> json) =>
      _$UpdateVerificationRequestDtoFromJson(json);

  final String applicantComment;

  Map<String, Object?> toJson() => _$UpdateVerificationRequestDtoToJson(this);
}
