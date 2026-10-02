// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_two_factor_code_dto.g.dart';

@JsonSerializable()
class AdminTwoFactorCodeDto {
  const AdminTwoFactorCodeDto({required this.code});

  factory AdminTwoFactorCodeDto.fromJson(Map<String, Object?> json) =>
      _$AdminTwoFactorCodeDtoFromJson(json);

  /// The 6-digit code from the authenticator app.
  final String code;

  Map<String, Object?> toJson() => _$AdminTwoFactorCodeDtoToJson(this);
}
