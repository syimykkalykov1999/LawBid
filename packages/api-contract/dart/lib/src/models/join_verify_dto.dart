// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'join_verify_dto.g.dart';

@JsonSerializable()
class JoinVerifyDto {
  const JoinVerifyDto({required this.attorneyPhone, required this.code});

  factory JoinVerifyDto.fromJson(Map<String, Object?> json) =>
      _$JoinVerifyDtoFromJson(json);

  /// The attorney's phone.
  final String attorneyPhone;
  final String code;

  Map<String, Object?> toJson() => _$JoinVerifyDtoToJson(this);
}
