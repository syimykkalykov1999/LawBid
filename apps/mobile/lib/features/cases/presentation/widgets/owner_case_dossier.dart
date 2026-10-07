import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_dossier.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:lawbid/features/templates/presentation/templates_screen.dart';

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

  /// Owner 2026-10-07 (bug 17): count, MB and formats from the admin.
  PlaceUploadLimits get _limits =>
      ref.read(uploadLimitsProvider)[UploadPlace.kase];

  int get _left => _limits.maxFiles - widget.kase.photos.length;

  Future<void> _pickPhotos() async {
    final limits = photoLimitsOf(ref.read(featureFlagsControllerProvider));
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: limits.maxPx,
      maxHeight: limits.maxPx,
      imageQuality: limits.quality,
      limit: _left > 1 ? _left : null,
    );
    await _add([
      for (final f in picked.take(_left))
        (bytes: await f.readAsBytes(), name: null),
    ]);
  }

  Future<void> _pickDocuments() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: _limits.documentExtensions,
      allowMultiple: true,
      withData: true,
    );
    await _add([
      for (final f in (result?.files ?? const <PlatformFile>[]).take(_left))
        if (f.bytes != null) (bytes: f.bytes!, name: f.name),
    ]);
  }

  /// Owner 2026-10-05: a document template — the server copies it into
  /// the client's own case file (nothing is uploaded from the phone).
  Future<void> _fromTemplate() async {
    final tpl = await pickTemplate(context);
    if (tpl == null || !mounted) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final id = await ref
          .read(templatesRepositoryProvider)
          .copy(tpl.id, TemplateTarget.kase);
      await ref.read(casesRepositoryProvider).setCaseFiles(widget.kase.id, [
        ...widget.kase.photos.map((p) => p.fileId),
        id,
      ]);
      ref.invalidate(ownerCaseProvider(widget.kase.id));
      if (mounted) showAppSnackBar(context, t.t('cases.dossier.filesSaved'));
    } on Object catch (e) {
      if (!mounted) return;
      if (isPlanRequired(e)) {
        unawaited(openPlanOffer(context, ref, PaywallReason.templates));
      } else {
        showAppSnackBar(context, t.t('cases.dossier.filesFailed'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Uploads [files] (antivirus-checked case files) and saves the case's
  /// full file list: the existing ones first, then the new ones.
  Future<void> _add(List<({Uint8List bytes, String? name})> files) async {
    if (files.isEmpty || !mounted) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final social = ref.read(socialActionsProvider);
      final ids = [
        for (final f in files)
          await social.uploadPhoto(
            f.bytes,
            casePhoto: true,
            fileName: f.name,
            maxBytes: _limits.fileBytes,
          ),
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
        t.t('cases.dossier.filesFull', {'max': '${_limits.maxFiles}'}),
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
      if (ref.read(templatesEnabledProvider))
        ActionSheetItem(
          icon: AppIcons.descriptionOutlined,
          label: t.t('cases.files.fromTemplate'),
          onTap: _fromTemplate,
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
