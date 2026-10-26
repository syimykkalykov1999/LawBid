// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'phone_status_dto.g.dart';

@JsonSerializable()
class PhoneStatusDto {
  const PhoneStatusDto({required this.identifier});

  factory PhoneStatusDto.fromJson(Map<String, Object?> json) =>
      _$PhoneStatusDtoFromJson(json);

  /// E.164 phone number.
  final String identifier;

  Map<String, Object?> toJson() => _$PhoneStatusDtoToJson(this);
}
