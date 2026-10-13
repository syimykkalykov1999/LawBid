// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'phone_status_result_dto.g.dart';

@JsonSerializable()
class PhoneStatusResultDto {
  const PhoneStatusResultDto({
    required this.registered,
    required this.hasPassword,
  });

  factory PhoneStatusResultDto.fromJson(Map<String, Object?> json) =>
      _$PhoneStatusResultDtoFromJson(json);

  final bool registered;

  /// The account has a password (else: sign in with a code once).
  final bool hasPassword;

  Map<String, Object?> toJson() => _$PhoneStatusResultDtoToJson(this);
}
