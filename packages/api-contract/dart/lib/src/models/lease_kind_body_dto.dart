// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'lease_queue_kind.dart';

part 'lease_kind_body_dto.g.dart';

@JsonSerializable()
class LeaseKindBodyDto {
  const LeaseKindBodyDto({required this.kind});

  factory LeaseKindBodyDto.fromJson(Map<String, Object?> json) =>
      _$LeaseKindBodyDtoFromJson(json);

  /// Queue kind: support_ticket · verification · report · mod_appeal · review_appeal.
  final LeaseQueueKind kind;

  Map<String, Object?> toJson() => _$LeaseKindBodyDtoToJson(this);
}
