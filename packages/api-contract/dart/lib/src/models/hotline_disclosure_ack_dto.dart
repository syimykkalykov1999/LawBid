// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_disclosure_ack_dto.g.dart';

@JsonSerializable()
class HotlineDisclosureAckDto {
  const HotlineDisclosureAckDto({this.version});

  factory HotlineDisclosureAckDto.fromJson(Map<String, Object?> json) =>
      _$HotlineDisclosureAckDtoFromJson(json);

  /// The text version the person saw (HotlineDisclosureDto.version); an older one is not counted.
  final num? version;

  Map<String, Object?> toJson() => _$HotlineDisclosureAckDtoToJson(this);
}
