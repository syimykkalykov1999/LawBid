import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';

enum AvatarSource { camera, gallery }

/// Picks a photo and returns its bytes (null = cancelled). Downscaled on
/// device to 1024 px (docs/03 §4.1: "сжатие до 1024 px"); the server makes
/// the square centre crop. Overridden in tests.
final avatarImagePickerProvider =
    Provider<Future<Uint8List?> Function(AvatarSource)>(
  (ref) => (source) async {
    final file = await ImagePicker().pickImage(
      source: source == AvatarSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 88,
      preferredCameraDevice: CameraDevice.front,
    );
    return file?.readAsBytes();
  },
);

/// Profile photo field (docs/03 §4.1; attorney onboarding photo, OQ-012):
/// current photo, "Add / Change photo" → camera or library → upload with a
/// progress ring, a status line, and Retry on failure. Visually a plain
/// form row so it fits the onboarding step's existing style.
class AvatarPickerField extends ConsumerWidget {
  const AvatarPickerField({
    super.key,
    this.initials,
    this.heroTag,
    this.label,
    this.requiredError,
  });

  final String? initials;
  final String? heroTag;

  /// Validation message for a required photo (attorney onboarding,
  /// docs/03 §4.1); shown in place of the hint while nothing is uploading.
  final String? requiredError;

  /// Field caption; defaults to "Profile photo".
  final String? label;

  Future<void> _pick(BuildContext context, WidgetRef ref, Translator t) async {
    final source = await showAppBottomSheet<AvatarSource>(
      context: context,
      builder: (sheetContext) => SafeArea(
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
                onTap: () =>
                    Navigator.of(sheetContext).pop(AvatarSource.camera),
              ),
              const SizedBox(height: AppSpacing.xs),
              AppListRow(
                icon: AppIcons.photoLibraryOutlined,
                label: t.t('profile.photo.gallery'),
                showChevron: false,
                onTap: () =>
                    Navigator.of(sheetContext).pop(AvatarSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null) return;
    Uint8List? bytes;
    try {
      bytes = await ref.read(avatarImagePickerProvider)(source);
    } catch (_) {
      if (context.mounted) {
        showAppSnackBar(context, t.t('profile.photo.pickFailed'));
      }
      return;
    }
    if (bytes == null) return;
    await ref.read(avatarUploadControllerProvider.notifier).start(bytes);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final upload = ref.watch(avatarUploadControllerProvider);
    final url = ref
        .watch(currentUserControllerProvider.select((s) => s.user?.avatarUrl));
    final hasPhoto = url != null || upload.preview != null;

    final (String status, Color statusColor) = switch (upload.stage) {
      AvatarUploadStage.preparing => (
          t.t('profile.photo.preparing'),
          colors.textSecondary
        ),
      AvatarUploadStage.uploading => (
          t.t(
            'profile.photo.uploading',
            {'percent': '${(upload.progress * 100).round()}'},
          ),
          colors.textSecondary,
        ),
      AvatarUploadStage.checking => (
          t.t('profile.photo.checking'),
          colors.textSecondary
        ),
      AvatarUploadStage.done => (t.t('profile.photo.done'), colors.success),
      AvatarUploadStage.failed => (
          errorText(t, upload.error ?? Object()),
          colors.dangerText
        ),
      AvatarUploadStage.idle => requiredError != null
          ? (requiredError!, colors.dangerText)
          : (t.t('profile.photo.hint'), colors.textSecondary),
    };

    return Row(
      children: [
        ProfileAvatar(
          size: AppSizes.stateMedallion - AppSpacing.xl,
          url: url,
          preview: upload.preview,
          initials: initials,
          heroTag: heroTag,
          progress: upload.busy ? upload.progress : null,
          semanticLabel: t.t('profile.avatar.label'),
        ),
        const SizedBox(width: AppSpacing.lg),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label ?? t.t('profile.photo.label'),
                style: typography.bodySmall.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Semantics(
                liveRegion: true,
                child: Text(
                  status,
                  style: typography.caption.copyWith(color: statusColor),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Wrap(
                spacing: AppSpacing.sm,
                children: [
                  if (upload.stage == AvatarUploadStage.failed)
                    _TextAction(
                      key: const ValueKey('avatar-retry'),
                      label: t.t('error.retry'),
                      icon: AppIcons.refreshRounded,
                      onTap: () => ref
                          .read(avatarUploadControllerProvider.notifier)
                          .retry(),
                    ),
                  _TextAction(
                    key: const ValueKey('avatar-pick'),
                    label: t.t(
                      hasPhoto ? 'profile.photo.change' : 'profile.photo.add',
                    ),
                    icon: AppIcons.photoCameraOutlined,
                    onTap: upload.busy ? null : () => _pick(context, ref, t),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TextAction extends StatelessWidget {
  const _TextAction({
    required this.label,
    required this.icon,
    required this.onTap,
    super.key,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final color = onTap == null ? colors.textSecondary : colors.goldStroke;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: AppPressable(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(icon, size: AppSpacing.lg + 2, color: color),
              const SizedBox(width: AppSpacing.xs),
              Text(label, style: typography.button.copyWith(color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
