import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart'
    show openCaseDocument;
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// OQ-047: a file picked for a chat.
typedef PickedChatFile = ({Uint8List bytes, String name, String mime});

/// The paperclip next to the message field: photos, camera or files (every
/// common document format). Files the server would refuse are reported.
Future<List<PickedChatFile>> pickChatFiles(
    BuildContext context, Translator t) async {
  final choice = await showAppBottomSheet<String>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          AppListRow(
            icon: Icons.photo_library_outlined,
            label: t.t('chat.attach.photos'),
            onTap: () => Navigator.of(sheet).pop('photos'),
          ),
          AppListRow(
            icon: Icons.photo_camera_outlined,
            label: t.t('chat.attach.camera'),
            onTap: () => Navigator.of(sheet).pop('camera'),
          ),
          AppListRow(
            icon: Icons.description_outlined,
            label: t.t('chat.attach.files'),
            onTap: () => Navigator.of(sheet).pop('files'),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
  if (choice == null) return const [];
  final out = <PickedChatFile>[];
  var skipped = 0;
  void add(Uint8List bytes, String name) {
    final mime = chatMimeForName(name);
    if (mime == null || bytes.length > kChatAttachmentMaxBytes) {
      skipped++;
      return;
    }
    out.add((bytes: bytes, name: name, mime: mime));
  }

  switch (choice) {
    case 'photos':
      final picked = await ImagePicker().pickMultiImage(
        maxWidth: 2560,
        maxHeight: 2560,
        imageQuality: 90,
        limit: 10,
      );
      for (final f in picked) {
        add(await f.readAsBytes(), f.name);
      }
    case 'camera':
      final f = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: 2560,
        maxHeight: 2560,
        imageQuality: 90,
      );
      if (f != null) add(await f.readAsBytes(), f.name);
    case 'files':
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: kChatFileExtensions,
        allowMultiple: true,
        withData: true,
      );
      for (final f in result?.files ?? const <PlatformFile>[]) {
        if (f.bytes == null) {
          skipped++;
          continue;
        }
        add(f.bytes!, f.name);
      }
  }
  if (skipped > 0 && context.mounted) {
    showAppSnackBar(context, t.t('chat.attach.skipped', {'count': '$skipped'}));
  }
  return out;
}

/// "12.4 MB", "830 KB".
String fileSizeLabel(int? bytes) {
  if (bytes == null) return '';
  if (bytes >= 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(bytes / 1024).ceil()} KB';
}

/// A document's colour and icon by its type.
({IconData icon, Color color}) docLook(String ext) => switch (ext) {
      'pdf' => (
          icon: Icons.picture_as_pdf_rounded,
          color: const Color(0xFFC62828)
        ),
      'doc' || 'docx' || 'odt' || 'rtf' => (
          icon: Icons.description_rounded,
          color: const Color(0xFF1E5AA8)
        ),
      'xls' || 'xlsx' || 'ods' || 'csv' => (
          icon: Icons.table_chart_rounded,
          color: const Color(0xFF1E7B45)
        ),
      'ppt' || 'pptx' || 'odp' => (
          icon: Icons.slideshow_rounded,
          color: const Color(0xFFC75B12)
        ),
      _ => (
          icon: Icons.insert_drive_file_rounded,
          color: const Color(0xFF5B6478)
        ),
    };

/// OQ-047: the inside of an attachment bubble — a photo (tap → full
/// screen) or a document card (tap → the phone's viewer), the upload
/// progress while sending, and the caption under it.
class AttachmentMessageBody extends ConsumerWidget {
  const AttachmentMessageBody({
    required this.message,
    required this.mine,
    super.key,
  });

  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = message.attachment!;
    final sending = message.delivery == DeliveryState.sending;
    final fg = mine ? colors.onAccent : colors.text;
    final pct = a.progress > 0 && a.progress < 1 ? a.progress : null;

    final Widget content;
    if (a.isImage) {
      final Widget image = a.localBytes != null
          ? Image.memory(a.localBytes!, fit: BoxFit.cover, cacheWidth: 600)
          : (a.previewUrl ?? a.url) != null
              ? Image.network(
                  (a.previewUrl ?? a.url)!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) =>
                      ColoredBox(color: colors.skeletonBase),
                )
              : ColoredBox(color: colors.skeletonBase);
      final ratio = (a.width != null && a.height != null && a.height! > 0)
          ? (a.width! / a.height!).clamp(0.6, 1.8).toDouble()
          : 4 / 3;
      content = Semantics(
        button: a.url != null,
        image: true,
        label: t.t('chat.attach.photo'),
        child: AppPressable(
          onTap: a.url == null
              ? () {}
              : () => showPhotoGallery(context,
                  urls: [a.url!], closeLabel: t.t('common.close')),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 220,
              child: AspectRatio(
                aspectRatio: ratio,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    image,
                    if (sending)
                      ColoredBox(
                        color: Colors.black26,
                        child: Center(
                          child: SizedBox.square(
                            dimension: 32,
                            child: CircularProgressIndicator(
                              value: pct,
                              strokeWidth: 3,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    } else {
      final look = docLook(a.extension);
      content = Semantics(
        button: a.url != null,
        label: '${a.name}, ${fileSizeLabel(a.sizeBytes)}',
        excludeSemantics: true,
        child: AppPressable(
          onTap: a.url == null ? () {} : () => openCaseDocument(a.url!),
          child: SizedBox(
            width: 240,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: look.color,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(look.icon, size: 20, color: Colors.white),
                          if (a.extension.isNotEmpty)
                            Text(
                              a.extension.toUpperCase(),
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
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(
                                color: fg, fontWeight: FontWeight.w600),
                          ),
                          Text(
                            [
                              fileSizeLabel(a.sizeBytes),
                              if (a.extension.isNotEmpty)
                                a.extension.toUpperCase(),
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: type.caption
                                .copyWith(color: fg.withValues(alpha: 0.75)),
                          ),
                        ],
                      ),
                    ),
                    if (a.url != null)
                      Icon(Icons.open_in_new_rounded,
                          size: 18, color: fg.withValues(alpha: 0.75)),
                  ],
                ),
                if (sending)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.xs),
                    child: LinearProgressIndicator(
                      value: pct,
                      minHeight: 3,
                      color: colors.gold,
                      backgroundColor: fg.withValues(alpha: 0.2),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        content,
        if (message.body.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          SizedBox(
            width: a.isImage ? 220 : 240,
            child: Text(message.body,
                style: type.body.copyWith(color: fg, height: 1.35)),
          ),
        ],
      ],
    );
  }
}

/// OQ-047: every photo and document of a chat — photos as a grid, then
/// documents as a list (chat menu → "Files").
class ChatFilesScreen extends ConsumerStatefulWidget {
  const ChatFilesScreen({required this.conversationId, super.key});

  final String conversationId;

  @override
  ConsumerState<ChatFilesScreen> createState() => _ChatFilesScreenState();
}

class _ChatFilesScreenState extends ConsumerState<ChatFilesScreen> {
  final _items = <ChatMessage>[];
  String? _cursor;
  bool _loading = true;
  bool _done = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref
          .read(chatRepositoryProvider)
          .attachments(widget.conversationId, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
        _loading = false;
      });
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final photos = [
      for (final m in _items)
        if (m.attachment?.isImage ?? false) m,
    ];
    final docs = [
      for (final m in _items)
        if (m.attachment != null && !m.attachment!.isImage) m,
    ];
    final photoUrls = [
      for (final m in photos)
        if (m.attachment!.url != null) m.attachment!.url!,
    ];

    Widget header(String text) => SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                AppSpacing.lg, AppSpacing.screenSide, AppSpacing.sm),
            child: Text(text,
                style: type.titleMedium.copyWith(color: colors.text)),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('chat.files.title')),
      ),
      body: _error != null && _items.isEmpty
          ? Center(
              child:
                  TextButton(onPressed: _load, child: Text(t.t('error.retry'))))
          : !_loading && _items.isEmpty
              ? AppEmptyState(
                  icon: Icons.folder_open_rounded,
                  message: t.t('chat.files.empty'),
                )
              : NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    if (n.metrics.extentAfter < 400 && !_loading && !_done) {
                      _load();
                    }
                    return false;
                  },
                  child: CustomScrollView(
                    slivers: [
                      if (photos.isNotEmpty) ...[
                        header(t.t('chat.files.photos')),
                        SliverPadding(
                          padding: const EdgeInsets.symmetric(horizontal: 2),
                          sliver: SliverGrid.builder(
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              mainAxisSpacing: 2,
                              crossAxisSpacing: 2,
                            ),
                            itemCount: photos.length,
                            itemBuilder: (context, i) {
                              final a = photos[i].attachment!;
                              return AppPressable(
                                onTap: a.url == null
                                    ? () {}
                                    : () => showPhotoGallery(context,
                                        urls: photoUrls,
                                        initial: photoUrls.indexOf(a.url!),
                                        closeLabel: t.t('common.close')),
                                child: a.previewUrl == null
                                    ? ColoredBox(color: colors.skeletonBase)
                                    : Image.network(a.previewUrl!,
                                        fit: BoxFit.cover),
                              );
                            },
                          ),
                        ),
                      ],
                      if (docs.isNotEmpty) ...[
                        header(t.t('chat.files.documents')),
                        SliverList.builder(
                          itemCount: docs.length,
                          itemBuilder: (context, i) {
                            final m = docs[i];
                            final a = m.attachment!;
                            final look = docLook(a.extension);
                            return ListTile(
                              leading: Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: look.color,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(look.icon,
                                    color: Colors.white, size: 20),
                              ),
                              title: Text(a.name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.bodySmall.copyWith(
                                      color: colors.text,
                                      fontWeight: FontWeight.w600)),
                              subtitle: Text(
                                  '${fileSizeLabel(a.sizeBytes)} · ${f.date(m.createdAt)}',
                                  style: type.caption
                                      .copyWith(color: colors.textSecondary)),
                              trailing: Icon(Icons.open_in_new_rounded,
                                  color: colors.textSecondary),
                              onTap: a.url == null
                                  ? null
                                  : () => openCaseDocument(a.url!),
                            );
                          },
                        ),
                      ],
                      if (_loading)
                        const SliverToBoxAdapter(
                          child: Padding(
                            padding: EdgeInsets.all(AppSpacing.lg),
                            child: Center(
                                child:
                                    CircularProgressIndicator(strokeWidth: 2)),
                          ),
                        ),
                      const SliverToBoxAdapter(
                          child: SizedBox(height: AppSpacing.xxl)),
                    ],
                  ),
                ),
    );
  }
}
