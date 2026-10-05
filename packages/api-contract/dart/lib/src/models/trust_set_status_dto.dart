// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'trust_set_status_dto_status.dart';

part 'trust_set_status_dto.g.dart';

@JsonSerializable()
class TrustSetStatusDto {
  const TrustSetStatusDto({required this.status, required this.note});

  factory TrustSetStatusDto.fromJson(Map<String, Object?> json) =>
      _$TrustSetStatusDtoFromJson(json);

  final TrustSetStatusDtoStatus status;
  final String note;

  Map<String, Object?> toJson() => _$TrustSetStatusDtoToJson(this);
}
