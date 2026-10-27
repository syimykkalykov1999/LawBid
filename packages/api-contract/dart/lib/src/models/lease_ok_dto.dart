// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'lease_ok_dto.g.dart';

@JsonSerializable()
class LeaseOkDto {
  const LeaseOkDto({required this.ok});

  factory LeaseOkDto.fromJson(Map<String, Object?> json) =>
      _$LeaseOkDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$LeaseOkDtoToJson(this);
}
