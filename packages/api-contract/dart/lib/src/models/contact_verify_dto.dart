// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_verify_dto_type.dart';

part 'contact_verify_dto.g.dart';

@JsonSerializable()
class ContactVerifyDto {
  const ContactVerifyDto({
    required this.type,
    required this.value,
    required this.code,
  });

  factory ContactVerifyDto.fromJson(Map<String, Object?> json) =>
      _$ContactVerifyDtoFromJson(json);

  final ContactVerifyDtoType type;
  final String value;
  final String code;

  Map<String, Object?> toJson() => _$ContactVerifyDtoToJson(this);
}
