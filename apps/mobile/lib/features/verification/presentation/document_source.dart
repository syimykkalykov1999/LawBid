import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/screens/camera_capture_screen.dart';

/// The frame drawn over the camera preview.
enum CaptureGuide {
  /// ID-1 card (driver license, state ID, bar card) — landscape frame.
  card,

  /// Passport page / certificate — taller frame.
  document,

  /// Face oval, front camera (docs/03 §2.2: selfie only from the camera).
  selfie,
}

/// Where the wizard gets files from. Overridden in tests (no camera or
/// file system there).
abstract interface class DocumentSource {
  Future<PickedDocument?> capture(BuildContext context, CaptureGuide guide);

  /// Photo library (images) or, with [allowPdf], any JPEG/PNG/HEIC/PDF
  /// from Files (licenses may be PDFs, docs/03 §2.2).
  Future<PickedDocument?> pickFile({required bool allowPdf});
}

final documentSourceProvider =
    Provider<DocumentSource>((ref) => const DeviceDocumentSource());

class DeviceDocumentSource implements DocumentSource {
  const DeviceDocumentSource();

  @override
  Future<PickedDocument?> capture(BuildContext context, CaptureGuide guide) =>
      Navigator.of(context, rootNavigator: true).push<PickedDocument>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => CameraCaptureScreen(guide: guide),
        ),
      );

  @override
  Future<PickedDocument?> pickFile({required bool allowPdf}) async {
    final result = await FilePicker.pickFiles(
      type: allowPdf ? FileType.custom : FileType.image,
      allowedExtensions:
          allowPdf ? const ['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'] : null,
      withData: true,
    );
    final file = result?.files.singleOrNull;
    final bytes = file?.bytes;
    if (file == null || bytes == null) return null;
    // Photo-library images may come without a known extension; they are
    // JPEG then (the API re-checks the real type by magic bytes).
    final mime = mimeForFileName(file.name) ?? 'image/jpeg';
    if (!allowPdf && mime == 'application/pdf') return null;
    return PickedDocument(name: file.name, mime: mime, bytes: bytes);
  }
}
