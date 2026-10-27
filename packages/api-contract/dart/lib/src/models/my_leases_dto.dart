// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_presence.dart';
import 'lease_capacity_dto.dart';
import 'lease_dto.dart';

part 'my_leases_dto.g.dart';

@JsonSerializable()
class MyLeasesDto {
  const MyLeasesDto({
    required this.status,
    required this.leases,
    required this.capacity,
    required this.wrapUpSec,
  });

  factory MyLeasesDto.fromJson(Map<String, Object?> json) =>
      _$MyLeasesDtoFromJson(json);

  final DeskPresence status;
  final List<LeaseDto> leases;

  /// Items in hands allowed at once: support dialogs / the rest.
  final LeaseCapacityDto capacity;

  /// Seconds of support wrap-up left (0 = none).
  final num wrapUpSec;

  Map<String, Object?> toJson() => _$MyLeasesDtoToJson(this);
}
