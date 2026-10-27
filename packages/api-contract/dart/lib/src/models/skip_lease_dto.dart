// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_skip_reason.dart';

part 'skip_lease_dto.g.dart';

@JsonSerializable()
class SkipLeaseDto {
  const SkipLeaseDto({required this.reason});

  factory SkipLeaseDto.fromJson(Map<String, Object?> json) =>
      _$SkipLeaseDtoFromJson(json);

  final LeaseSkipReason reason;

  Map<String, Object?> toJson() => _$SkipLeaseDtoToJson(this);
}
