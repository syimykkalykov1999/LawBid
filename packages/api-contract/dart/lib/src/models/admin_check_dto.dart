// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'check_result.dart';
import 'verification_check_type.dart';
import 'verification_provider.dart';

part 'admin_check_dto.g.dart';

@JsonSerializable()
class AdminCheckDto {
  const AdminCheckDto({
    required this.id,
    required this.checkType,
    required this.provider,
    required this.result,
    required this.details,
    required this.checkedAt,
  });

  factory AdminCheckDto.fromJson(Map<String, Object?> json) =>
      _$AdminCheckDtoFromJson(json);

  final String id;
  final VerificationCheckType checkType;
  final VerificationProvider provider;
  final CheckResult result;
  final dynamic details;
  final DateTime checkedAt;

  Map<String, Object?> toJson() => _$AdminCheckDtoToJson(this);
}
