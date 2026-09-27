// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_request_dto_type.dart';

part 'contact_request_dto.g.dart';

@JsonSerializable()
class ContactRequestDto {
  const ContactRequestDto({required this.type, required this.value});

  factory ContactRequestDto.fromJson(Map<String, Object?> json) =>
      _$ContactRequestDtoFromJson(json);

  final ContactRequestDtoType type;
  final String value;

  Map<String, Object?> toJson() => _$ContactRequestDtoToJson(this);
}
