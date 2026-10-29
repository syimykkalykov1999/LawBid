// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_private_details_dto.g.dart';

@JsonSerializable()
class UpdatePrivateDetailsDto {
  const UpdatePrivateDetailsDto({
    required this.privateDetails,
  });
  
  factory UpdatePrivateDetailsDto.fromJson(Map<String, Object?> json) => _$UpdatePrivateDetailsDtoFromJson(json);
  
  /// Only the owner and the accepted attorney read them; empty clears.
  final String privateDetails;

  Map<String, Object?> toJson() => _$UpdatePrivateDetailsDtoToJson(this);
}
