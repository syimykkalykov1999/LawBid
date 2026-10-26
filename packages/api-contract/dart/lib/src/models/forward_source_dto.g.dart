// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forward_source_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ForwardSourceDto _$ForwardSourceDtoFromJson(Map<String, dynamic> json) =>
    ForwardSourceDto(
      kind: ForwardSourceKind.fromJson(json['kind'] as String),
      id: json['id'] as String,
    );

Map<String, dynamic> _$ForwardSourceDtoToJson(ForwardSourceDto instance) =>
    <String, dynamic>{'kind': instance.kind.toJson(), 'id': instance.id};
