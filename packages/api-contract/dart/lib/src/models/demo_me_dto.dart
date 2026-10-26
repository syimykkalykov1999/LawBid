// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_account_dto.dart';

part 'demo_me_dto.g.dart';

@JsonSerializable()
class DemoMeDto {
  const DemoMeDto({
    required this.enabled,
    required this.canCreate,
    required this.maxAccounts,
    required this.ttlDays,
    required this.accounts,
  });

  factory DemoMeDto.fromJson(Map<String, Object?> json) =>
      _$DemoMeDtoFromJson(json);

  /// Master switch on and this account is an active partner with demo access.
  final bool enabled;
  final bool canCreate;
  final num maxAccounts;
  final num ttlDays;
  final List<DemoAccountDto> accounts;

  Map<String, Object?> toJson() => _$DemoMeDtoToJson(this);
}
