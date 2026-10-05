// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payroll_cancel_dto.g.dart';

@JsonSerializable()
class PayrollCancelDto {
  const PayrollCancelDto({this.reason = ''});

  factory PayrollCancelDto.fromJson(Map<String, Object?> json) =>
      _$PayrollCancelDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$PayrollCancelDtoToJson(this);
}
