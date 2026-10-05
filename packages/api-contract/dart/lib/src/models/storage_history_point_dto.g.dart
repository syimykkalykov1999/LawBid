// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_history_point_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageHistoryPointDto _$StorageHistoryPointDtoFromJson(
  Map<String, dynamic> json,
) => StorageHistoryPointDto(
  day: json['day'] as String,
  filesBytes: json['filesBytes'] as num,
  storedBytes: json['storedBytes'] as num,
  dbBytes: json['dbBytes'] as num,
  filesCount: json['filesCount'] as num,
);

Map<String, dynamic> _$StorageHistoryPointDtoToJson(
  StorageHistoryPointDto instance,
) => <String, dynamic>{
  'day': instance.day,
  'filesBytes': instance.filesBytes,
  'storedBytes': instance.storedBytes,
  'dbBytes': instance.dbBytes,
  'filesCount': instance.filesCount,
};
