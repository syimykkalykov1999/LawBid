import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart';

/// What the owner of the photo chose in the «Group photo» sheet.
enum GroupPhotoChoice { camera, gallery, remove }

/// The camera / gallery / remove sheet for the group photo.
Future<GroupPhotoChoice?> showGroupPhotoSheet(
  BuildContext context, {
  required Translator t,
  required bool hasPhoto,
}) =>
    showAppBottomSheet<GroupPhotoChoice>(
      context: context,
      builder: (sheet) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              AppListRow(
                icon: AppIcons.photoCameraOutlined,
                label: t.t('profile.photo.camera'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(GroupPhotoChoice.camera),
              ),
              const SizedBox(height: AppSpacing.xs),
              AppListRow(
                icon: AppIcons.photoLibraryOutlined,
                label: t.t('profile.photo.gallery'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(GroupPhotoChoice.gallery),
              ),
              if (hasPhoto) ...[
                const SizedBox(height: AppSpacing.xs),
                AppListRow(
                  icon: AppIcons.deleteOutlineRounded,
                  label: t.t('group.info.photoRemove'),
                  destructive: true,
                  showChevron: false,
                  onTap: () => Navigator.of(sheet).pop(GroupPhotoChoice.remove),
                ),
              ],
            ],
          ),
        ),
      ),
    );

/// Picks a photo (camera or gallery) and returns its bytes; null when the
/// person cancelled. Reuses the profile photo picker, so the size and
/// quality limits are the admin's «avatar» ones.
Future<Uint8List?> pickGroupPhoto(WidgetRef ref, GroupPhotoChoice choice) =>
    ref.read(avatarImagePickerProvider)(
      choice == GroupPhotoChoice.camera
          ? AvatarSource.camera
          : AvatarSource.gallery,
    );

/// The profile photo pipeline (presign → storage → confirm → scan) for a
/// group photo: returns the clean file's id, which the caller sets with
/// `UpdateGroupDto(avatarFileId:)`. Throws [ApiException].
Future<String> uploadGroupPhoto(WidgetRef ref, Uint8List bytes) async {
  final repo = ref.read(avatarUploadRepositoryProvider);
  final limits = ref.read(uploadLimitsProvider)[UploadPlace.avatar];
  final mime = sniffImageMime(bytes);
  if (mime == null || !limits.photoMimes.contains(mime)) {
    throw const ApiException(
      code: ApiErrorCodes.fileTypeNotAllowed,
      message: ApiErrorCodes.fileTypeNotAllowed,
    );
  }
  if (bytes.length > limits.fileBytes) {
    throw const ApiException(
      code: ApiErrorCodes.fileTooLarge,
      message: ApiErrorCodes.fileTooLarge,
    );
  }
  final target = await repo.presign(
    mime: mime,
    sizeBytes: bytes.length,
    sha256: sha256Hex(bytes),
  );
  await repo.upload(target, bytes, mime);
  var outcome = await repo.confirm(target.fileId);
  for (var i = 0; outcome == ScanOutcome.pending && i < 30; i++) {
    await Future<void>.delayed(const Duration(seconds: 1));
    outcome = await repo.scanStatus(target.fileId);
  }
  if (outcome != ScanOutcome.clean) {
    throw const ApiException(
      code: ApiErrorCodes.fileNotAttachable,
      message: ApiErrorCodes.fileNotAttachable,
    );
  }
  return target.fileId;
}

/// Takes the group photo away. The generated `UpdateGroupDto` leaves a null
/// field out of the JSON, but the server reads an explicit
/// `avatarFileId: null` as «remove the photo», so this sends it by hand.
Future<void> removeGroupPhoto(WidgetRef ref, String groupId) => guardApiCall(
      () => ref.read(dioProvider).patch<void>(
        '/groups/${Uri.encodeComponent(groupId)}',
        data: const {'avatarFileId': null},
      ),
    );
