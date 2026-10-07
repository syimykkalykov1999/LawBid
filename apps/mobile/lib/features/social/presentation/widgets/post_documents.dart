import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart'
    show openCaseDocument;
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show docLook, fileSizeLabel;
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-05: one document in the composer, uploaded right after it
/// is picked so "Опубликовать" only waits for what is still in flight.
class PostDocumentDraft {
  PostDocumentDraft({
    required this.name,
    required this.mime,
    required this.bytes,
  });

  final String name;
  final String mime;
  final Uint8List bytes;
  final key = UniqueKey();
  double progress = 0;
  String? fileId;
  Object? error;

  bool get uploading => fileId == null && error == null;
  String get extension => documentExtension(name);
}

/// "pdf" of "Lease.PDF"; "" without an extension.
String documentExtension(String name) {
  final dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
}

/// Owner 2026-10-05: the admin's photo compression for posts and reels.
PhotoLimits postPhotoLimits(WidgetRef ref) =>
    photoLimitsOf(ref.read(featureFlagsControllerProvider));

/// The documents of a post or a reel being written: pick (PDF, Word,
/// text), upload with progress, retry, remove. The server checks the same
/// limits again.
class PostDocumentsController extends ChangeNotifier {
  PostDocumentsController(
    this._actions, {
    this.limits = const PlaceUploadLimits(
      maxPhotos: kPostMaxPhotos,
      maxFiles: kPostMaxDocuments,
      fileMb: kPostDocumentDefaultMaxMb,
      totalMb: kPostDocumentsDefaultTotalMb,
      formats: {'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'},
    ),
  });

  final SocialActions _actions;

  /// Owner 2026-10-07 (bug 17): the admin's post or reel limits (count,
  /// MB, formats) from «Загрузки и файлы».
  final PlaceUploadLimits limits;
  final items = <PostDocumentDraft>[];
  bool _disposed = false;

  bool get ready => items.every((d) => d.fileId != null);
  bool get full => items.length >= limits.maxFiles;

  /// MIME of a document whose format is on here (photos never).
  String? mimeForName(String name) {
    final mime = limits.mimeForName(name);
    return mime == null || mime.startsWith('image/') ? null : mime;
  }

  List<PostDocumentRef> get refs => [
        for (final d in items)
          PostDocumentRef(fileId: d.fileId!, fileName: d.name),
      ];

  /// Adds what fits the limits and starts uploading; returns how many
  /// files were skipped (type, size, the total or the admin's count).
  int addAll(
    List<({Uint8List bytes, String name})> files, {
    required int eachMb,
    required int totalMb,
  }) {
    var skipped = 0;
    var total = items.fold<int>(0, (s, d) => s + d.bytes.length);
    for (final f in files) {
      final mime = mimeForName(f.name);
      if (full ||
          mime == null ||
          f.bytes.isEmpty ||
          f.bytes.length > eachMb * 1024 * 1024 ||
          total + f.bytes.length > totalMb * 1024 * 1024) {
        skipped++;
        continue;
      }
      total += f.bytes.length;
      final d = PostDocumentDraft(name: f.name, mime: mime, bytes: f.bytes);
      items.add(d);
      // ignore: unawaited_futures
      upload(d, eachMb: eachMb);
    }
    _notify();
    return skipped;
  }

  Future<void> pick(BuildContext context, Translator t, WidgetRef ref) async {
    if (full) return;
    final extensions = limits.documentExtensions;
    if (extensions.isEmpty) return;
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: extensions,
      allowMultiple: true,
      withData: true,
    );
    final files = [
      for (final f in result?.files ?? const <PlatformFile>[])
        if (f.bytes != null) (bytes: f.bytes!, name: f.name),
    ];
    final unreadable = (result?.files.length ?? 0) - files.length;
    final skipped = addAll(
          files,
          eachMb: limits.fileMb,
          totalMb: limits.totalMb,
        ) +
        unreadable;
    if (skipped > 0 && context.mounted) {
      showAppSnackBar(
        context,
        t.t('post.docs.skipped', {
          'count': '$skipped',
          'mb': '${limits.fileMb}',
          'total': '${limits.totalMb}',
        }),
      );
    }
  }

  Future<void> upload(PostDocumentDraft d, {required int eachMb}) async {
    d
      ..error = null
      ..progress = 0;
    _notify();
    try {
      final id = await _actions.uploadDocument(
        d.bytes,
        d.mime,
        maxBytes: eachMb * 1024 * 1024,
        onProgress: (p) {
          d.progress = p;
          _notify();
        },
      );
      d.fileId = id;
    } on Object catch (e) {
      d.error = e;
    }
    _notify();
  }

  void remove(PostDocumentDraft d) {
    items.remove(d);
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// The "Документы" block of the composers: the list (name, size, progress,
/// retry, remove) and "Добавить документ".
class PostDocumentsEditor extends ConsumerWidget {
  const PostDocumentsEditor({
    required this.controller,
    this.enabled = true,
    super.key,
  });

  final PostDocumentsController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final limits = controller.limits;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('post.docs.title'),
                  style: type.titleMedium,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                '${controller.items.length} / ${limits.maxFiles}',
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final d in controller.items) ...[
            _DraftRow(
              key: d.key,
              draft: d,
              enabled: enabled,
              removeLabel: t.t('post.docs.remove'),
              retryLabel: t.t('error.retry'),
              errorText: d.error == null ? null : errorText(t, d.error!),
              onRemove: () => controller.remove(d),
              onRetry: () => controller.upload(d, eachMb: limits.fileMb),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (!controller.full)
            AppButton(
              label: t.t('post.docs.add'),
              icon: AppIcons.attachFileRounded,
              variant: AppButtonVariant.secondary,
              isEnabled: enabled,
              onPressed: () => controller.pick(context, t, ref),
            ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('post.docs.hint', {
              'mb': '${limits.fileMb}',
              'total': '${limits.totalMb}',
            }),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _DocBadge extends StatelessWidget {
  const _DocBadge(this.extension);

  final String extension;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final look = docLook(extension);
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: look.color,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppIcon(look.icon, size: 18, color: Colors.white),
          if (extension.isNotEmpty)
            Text(
              extension.toUpperCase(),
              maxLines: 1,
              style: type.caption.copyWith(
                color: Colors.white,
                fontSize: 8,
                fontWeight: FontWeight.w700,
                height: 1,
              ),
            ),
        ],
      ),
    );
  }
}

class _DraftRow extends StatelessWidget {
  const _DraftRow({
    required this.draft,
    required this.enabled,
    required this.removeLabel,
    required this.retryLabel,
    required this.onRemove,
    required this.onRetry,
    this.errorText,
    super.key,
  });

  final PostDocumentDraft draft;
  final bool enabled;
  final String removeLabel;
  final String retryLabel;
  final String? errorText;
  final VoidCallback onRemove;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.sm,
        AppSpacing.sm,
        0,
        AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(
          color: draft.error != null ? colors.dangerText : colors.border,
        ),
      ),
      child: Row(
        children: [
          _DocBadge(draft.extension),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  draft.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                if (draft.uploading)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: draft.progress > 0 ? draft.progress : null,
                      minHeight: 3,
                      color: colors.gold,
                      backgroundColor: colors.border,
                    ),
                  )
                else
                  Text(
                    errorText ?? fileSizeLabel(draft.bytes.length),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(
                      color: draft.error != null
                          ? colors.dangerText
                          : colors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
          if (draft.error != null)
            AppIconButton(
              icon: const AppIcon(AppIcons.refreshRounded),
              semanticLabel: retryLabel,
              onPressed: enabled ? onRetry : null,
            ),
          AppIconButton(
            icon: const AppIcon(AppIcons.closeRounded),
            semanticLabel: removeLabel,
            onPressed: enabled ? onRemove : null,
          ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-05: a post's documents as readers see them; a tap opens
/// (downloads) the file under its own name.
class PostDocumentsList extends ConsumerWidget {
  const PostDocumentsList({
    required this.documents,
    this.onDark = false,
    super.key,
  });

  final List<PostAttachment> documents;

  /// On the reel's dark inner page.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = onDark ? Colors.white : colors.text;
    final sub = onDark ? Colors.white70 : colors.textSecondary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final d in documents) ...[
          Semantics(
            button: true,
            label: t.t('post.docs.open', {'name': d.fileName}),
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => openCaseDocument(d.url),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: onDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.card),
                  border: Border.all(
                    color: onDark ? Colors.white24 : colors.border,
                  ),
                ),
                child: Row(
                  children: [
                    _DocBadge(documentExtension(d.fileName)),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            d.fileName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(
                              color: fg,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            [
                              fileSizeLabel(d.sizeBytes),
                              documentExtension(d.fileName).toUpperCase(),
                            ].where((s) => s.isNotEmpty).join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(color: sub),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    AppIcon(AppIcons.downloadRounded, size: 20, color: sub),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}
