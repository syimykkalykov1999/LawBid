import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_dossier.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner 2026-10-05: the client's own case file — the same "4 of 6" the
/// attorneys see, who sees what, and (while the case is open) a button to
/// add the documents and photos the case is missing.
class OwnerCaseDossier extends ConsumerStatefulWidget {
  const OwnerCaseDossier({required this.kase, super.key});

  final OwnerCase kase;

  @override
  ConsumerState<OwnerCaseDossier> createState() => _OwnerCaseDossierState();
}

class _OwnerCaseDossierState extends ConsumerState<OwnerCaseDossier> {
  bool _busy = false;

  int get _left => kCaseMaxPhotos - widget.kase.photos.length;

  Future<void> _pickPhotos() async {
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 90,
      limit: _left > 1 ? _left : null,
    );
    await _add([for (final f in picked.take(_left)) await f.readAsBytes()]);
  }

  Future<void> _pickDocuments() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'docx'],
      allowMultiple: true,
      withData: true,
    );
    await _add([
      for (final f in (result?.files ?? const <PlatformFile>[]).take(_left))
        if (f.bytes != null) f.bytes!,
    ]);
  }

  /// Uploads [files] (antivirus-checked case files) and saves the case's
  /// full file list: the existing ones first, then the new ones.
  Future<void> _add(List<Uint8List> files) async {
    if (files.isEmpty || !mounted) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final social = ref.read(socialActionsProvider);
      final ids = [
        for (final b in files) await social.uploadPhoto(b, casePhoto: true),
      ];
      await ref.read(casesRepositoryProvider).setCaseFiles(widget.kase.id, [
        ...widget.kase.photos.map((p) => p.fileId),
        ...ids,
      ]);
      ref.invalidate(ownerCaseProvider(widget.kase.id));
      if (mounted) showAppSnackBar(context, t.t('cases.dossier.filesSaved'));
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('cases.dossier.filesFailed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _choose() {
    final t = ref.read(translatorProvider);
    if (_left <= 0) {
      showAppSnackBar(
        context,
        t.t('cases.dossier.filesFull', {'max': '$kCaseMaxPhotos'}),
      );
      return;
    }
    showActionSheet(context, [
      ActionSheetItem(
        icon: AppIcons.addPhotoAlternateOutlined,
        label: t.t('cases.photos.add'),
        onTap: _pickPhotos,
      ),
      ActionSheetItem(
        icon: AppIcons.noteAddOutlined,
        label: t.t('cases.files.add'),
        onTap: _pickDocuments,
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final c = widget.kase;
    final open = c.status == CaseStatus.open;
    return CaseDossierPanel(
      score: CaseDossierScore.ofOwner(c),
      status: c.status,
      t: t,
      rule: CaseDossierRule.owner,
      action: open && _left > 0
          ? AppButton(
              label: t.t('cases.dossier.addFiles'),
              icon: AppIcons.attachFileRounded,
              variant: AppButtonVariant.secondary,
              height: 44,
              isLoading: _busy,
              onPressed: _busy ? null : _choose,
            )
          : null,
    );
  }
}
