// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_two_factor_enabled_dto.g.dart';

@JsonSerializable()
class AdminTwoFactorEnabledDto {
  const AdminTwoFactorEnabledDto({required this.recoveryCodes});

  factory AdminTwoFactorEnabledDto.fromJson(Map<String, Object?> json) =>
      _$AdminTwoFactorEnabledDtoFromJson(json);

  /// Ten one-time recovery codes, shown once.
  final List<String> recoveryCodes;

  Map<String, Object?> toJson() => _$AdminTwoFactorEnabledDtoToJson(this);
}
