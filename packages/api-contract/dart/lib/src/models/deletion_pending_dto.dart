// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'deletion_pending_dto.g.dart';

@JsonSerializable()
class DeletionPendingDto {
  const DeletionPendingDto({required this.deletionPending});

  factory DeletionPendingDto.fromJson(Map<String, Object?> json) =>
      _$DeletionPendingDtoFromJson(json);

  /// Always true.
  final bool deletionPending;

  Map<String, Object?> toJson() => _$DeletionPendingDtoToJson(this);
}
