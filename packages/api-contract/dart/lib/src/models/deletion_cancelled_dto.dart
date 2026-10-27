// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'deletion_cancelled_dto.g.dart';

@JsonSerializable()
class DeletionCancelledDto {
  const DeletionCancelledDto({required this.cancelled});

  factory DeletionCancelledDto.fromJson(Map<String, Object?> json) =>
      _$DeletionCancelledDtoFromJson(json);

  /// True when a pending deletion was cancelled; false when there was none.
  final bool cancelled;

  Map<String, Object?> toJson() => _$DeletionCancelledDtoToJson(this);
}
