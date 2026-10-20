// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'transfer_group_dto.g.dart';

@JsonSerializable()
class TransferGroupDto {
  const TransferGroupDto({required this.userId});

  factory TransferGroupDto.fromJson(Map<String, Object?> json) =>
      _$TransferGroupDtoFromJson(json);

  final String userId;

  Map<String, Object?> toJson() => _$TransferGroupDtoToJson(this);
}
