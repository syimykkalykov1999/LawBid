import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart'
    show sniffImageMime;
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/stickers/application/stickers_providers.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/stickers/presentation/emoji_data.dart';

/// Owner 2026-10-01 — Telegram-style stickers: the image, the panel under
/// the chat composer (Emoji · Stickers), the pack sheet and "+" for own
/// packs.
class StickerImage extends StatelessWidget {
  const StickerImage({required this.sticker, this.size = 72, super.key});

  final ChatSticker sticker;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = sticker.url;
    return SizedBox.square(
      dimension: size,
      child: url == null
          ? Center(
              child:
                  Text(sticker.emoji, style: TextStyle(fontSize: size * 0.55)),
            )
          : CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.contain,
              fadeInDuration: const Duration(milliseconds: 120),
              placeholder: (_, __) => Center(
                child: Text(
                  sticker.emoji,
                  style: TextStyle(fontSize: size * 0.45),
                ),
              ),
              errorWidget: (_, __, ___) => Center(
                child: Text(
                  sticker.emoji,
                  style: TextStyle(fontSize: size * 0.45),
                ),
              ),
            ),
    );
  }
}

/// The panel that replaces the keyboard: Emoji · Stickers.
class StickerPanel extends ConsumerStatefulWidget {
  const StickerPanel({
    required this.onSticker,
    required this.onEmoji,
    super.key,
  });

  final ValueChanged<ChatSticker> onSticker;
  final ValueChanged<String> onEmoji;

  static const height = 300.0;

  @override
  ConsumerState<StickerPanel> createState() => _StickerPanelState();
}

class _StickerPanelState extends ConsumerState<StickerPanel> {
  bool _stickers = true;

  /// -1 = recent, otherwise an index into the packs.
  int _section = -1;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // Owner 2026-10-02: the Emoji · Stickers tabs sit above the system
    // navigation (gesture bar or Samsung's back/home/recents buttons).
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    return Material(
      color: colors.surface,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomInset),
        child: SizedBox(
          height: StickerPanel.height,
          child: Column(
            children: [
              Expanded(
                child: _stickers ? _stickerView(t, colors, type) : _emojiView(),
              ),
              Container(
                height: 44,
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: colors.border)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _tab(
                      t.t('stickers.tab.emoji'),
                      !_stickers,
                      () => setState(() => _stickers = false),
                      colors,
                      type,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    _tab(
                      t.t('stickers.tab.stickers'),
                      _stickers,
                      () => setState(() => _stickers = true),
                      colors,
                      type,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tab(
    String label,
    bool on,
    VoidCallback tap,
    AppColorTokens colors,
    AppTypographyTokens type,
  ) =>
      AppPressable(
        onTap: tap,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: 6,
          ),
          decoration: BoxDecoration(
            color: on ? colors.goldTint : null,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: Text(
            label,
            style: type.bodySmall.copyWith(
              color: on ? colors.goldDark : colors.textSecondary,
              fontWeight: on ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      );

  Widget _emojiView() => CustomScrollView(
        slivers: [
          for (final (_, list) in kEmojiGroups)
            SliverPadding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              sliver: SliverGrid.count(
                crossAxisCount: 8,
                children: [
                  for (final e in list)
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => widget.onEmoji(e),
                      child: Center(
                        child: Text(e, style: const TextStyle(fontSize: 26)),
                      ),
                    ),
                ],
              ),
            ),
        ],
      );

  Widget _stickerView(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
  ) {
    final lib = ref.watch(stickerLibraryProvider);
    final data = lib.value ?? StickerLibrary.empty;
    if (lib.isLoading && lib.value == null) {
      return Center(child: CircularProgressIndicator(color: colors.gold));
    }
    final section = _section >= data.packs.length ? -1 : _section;
    final items = section == -1 ? data.recent : data.packs[section].stickers;
    final pack = section == -1 ? null : data.packs[section];

    // ignore: avoid_positional_boolean_parameters
    Widget strip(Widget child, bool on, VoidCallback tap) => AppPressable(
          onTap: tap,
          child: Container(
            width: 44,
            height: 44,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: on ? colors.goldTint : null,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(child: child),
          ),
        );

    return Column(
      children: [
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: 4,
            ),
            children: [
              strip(
                AppIcon(
                  AppIcons.scheduleRounded,
                  color: colors.textSecondary,
                  size: 22,
                ),
                section == -1,
                () => setState(() => _section = -1),
              ),
              for (var i = 0; i < data.packs.length; i++)
                strip(
                  data.packs[i].cover == null
                      ? AppIcon(
                          AppIcons.stickerOutlined,
                          color: colors.textSecondary,
                          size: 22,
                        )
                      : StickerImage(sticker: data.packs[i].cover!, size: 34),
                  section == i,
                  () => setState(() => _section = i),
                ),
              strip(
                AppIcon(AppIcons.addRounded, color: colors.goldDark, size: 24),
                false,
                () => showStickerHub(context),
              ),
            ],
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          pack != null && pack.isMine
                              ? t.t('stickers.packEmpty')
                              : t.t('stickers.empty'),
                          textAlign: TextAlign.center,
                          style: type.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        TextButton(
                          onPressed: () => pack != null && pack.isMine
                              ? showStickerPackSheet(context, pack.id)
                              : showStickerHub(context),
                          child: Text(
                            pack != null && pack.isMine
                                ? t.t('stickers.add')
                                : t.t('stickers.browse'),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 4,
                    mainAxisSpacing: AppSpacing.sm,
                    crossAxisSpacing: AppSpacing.sm,
                  ),
                  itemCount: items.length,
                  itemBuilder: (_, i) => GestureDetector(
                    onTap: () => widget.onSticker(items[i]),
                    onLongPress: () =>
                        showStickerPackSheet(context, items[i].packId),
                    child: StickerImage(sticker: items[i], size: 80),
                  ),
                ),
        ),
      ],
    );
  }
}

/// A sticker in the chat: no bubble, like Telegram; tap → its pack.
class StickerMessageBody extends StatelessWidget {
  const StickerMessageBody({required this.sticker, super.key});

  final ChatSticker sticker;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => showStickerPackSheet(context, sticker.packId),
        child: StickerImage(sticker: sticker, size: 150),
      );
}

/// "+" in the panel: my packs (create one), and popular official packs.
Future<void> showStickerHub(BuildContext context) => showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _StickerHub(),
    );

class _StickerHub extends ConsumerWidget {
  const _StickerHub();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final lib = ref.watch(stickerLibraryProvider).value ?? StickerLibrary.empty;
    final featured = ref.watch(featuredStickerPacksProvider).value ?? const [];

    Widget row(StickerPack p) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: p.cover == null
              ? AppIcon(AppIcons.stickerOutlined, color: colors.textSecondary)
              : StickerImage(sticker: p.cover!, size: 44),
          title: Text(p.title, style: type.body.copyWith(color: colors.text)),
          subtitle: Text(
            t.t('stickers.count', {'count': '${p.stickers.length}'}),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          trailing: AppIcon(
            AppIcons.chevronRightRounded,
            color: colors.textSecondary,
          ),
          onTap: () => showStickerPackSheet(context, p.id),
        );

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      builder: (_, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xl,
        ),
        children: [
          const AppSheetHandle(),
          const SizedBox(height: AppSpacing.md),
          Text(
            t.t('stickers.title'),
            style: type.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: t.t('stickers.create'),
            icon: AppIcons.addRounded,
            onPressed: () => _createPack(context, ref),
          ),
          if (lib.packs.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('stickers.mine'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            for (final p in lib.packs) row(p),
          ],
          if (featured.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('stickers.featured'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            for (final p in featured) row(p),
          ],
        ],
      ),
    );
  }
}

Future<void> _createPack(BuildContext context, WidgetRef ref) async {
  final t = ref.read(translatorProvider);
  final title = TextEditingController();
  final ok = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(ctx).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: title,
            hintText: t.t('stickers.create.hint'),
            semanticLabel: t.t('stickers.create.hint'),
            maxLength: 64,
            autofocus: true,
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: t.t('stickers.create'),
            onPressed: () => Navigator.of(ctx).pop(true),
          ),
        ],
      ),
    ),
  );
  final name = title.text.trim();
  title.dispose();
  if (ok != true || name.isEmpty || !context.mounted) return;
  try {
    final pack = await ref.read(stickersRepositoryProvider).create(name);
    ref.invalidate(stickerLibraryProvider);
    if (context.mounted) await showStickerPackSheet(context, pack.id);
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}

/// A pack: its stickers; Add / Remove for others' packs; for mine — add a
/// sticker ("+"), delete one (long press), rename, delete the pack.
Future<void> showStickerPackSheet(BuildContext context, String packRef) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PackSheet(packRef: packRef),
    );

class _PackSheet extends ConsumerStatefulWidget {
  const _PackSheet({required this.packRef});

  final String packRef;

  @override
  ConsumerState<_PackSheet> createState() => _PackSheetState();
}

class _PackSheetState extends ConsumerState<_PackSheet> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await action();
      ref
        ..invalidate(stickerPackProvider(widget.packRef))
        ..invalidate(stickerLibraryProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addSticker(StickerPack pack) async {
    final t = ref.read(translatorProvider);
    final x = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 512,
      maxHeight: 512,
    );
    if (x == null || !mounted) return;
    final bytes = await x.readAsBytes();
    final mime = sniffImageMime(bytes);
    if (mime == null) {
      if (mounted) showAppSnackBar(context, t.t('stickers.badImage'));
      return;
    }
    final emoji = await _pickEmoji();
    if (emoji == null) return;
    await _run(() async {
      await ref
          .read(stickersRepositoryProvider)
          .add(pack.id, bytes, mime, emoji: emoji);
      // ignore: unawaited_futures
      HapticFeedback.mediumImpact();
      if (mounted) showAppSnackBar(context, t.t('stickers.added'));
    });
  }

  Future<String?> _pickEmoji() => showAppBottomSheet<String>(
        context: context,
        builder: (ctx) {
          final t = ref.read(translatorProvider);
          final type = Theme.of(ctx).extension<AppTypographyTokens>()!;
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const AppSheetHandle(),
                  const SizedBox(height: AppSpacing.sm),
                  Text(t.t('stickers.pickEmoji'), style: type.body),
                  const SizedBox(height: AppSpacing.sm),
                  SizedBox(
                    height: 220,
                    child: GridView.count(
                      crossAxisCount: 8,
                      children: [
                        for (final e in kEmojiGroups.first.$2)
                          InkWell(
                            onTap: () => Navigator.of(ctx).pop(e),
                            child: Center(
                              child:
                                  Text(e, style: const TextStyle(fontSize: 26)),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(stickerPackProvider(widget.packRef));
    final repo = ref.read(stickersRepositoryProvider);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.95,
      builder: (_, scroll) => async.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: colors.gold)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Text(errorText(t, e), textAlign: TextAlign.center),
          ),
        ),
        data: (pack) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.sm,
                0,
              ),
              child: Column(
                children: [
                  const AppSheetHandle(),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              pack.title,
                              style:
                                  type.titleMedium.copyWith(color: colors.text),
                            ),
                            Text(
                              pack.isOfficial
                                  ? t.t('stickers.official')
                                  : t.t('stickers.count', {
                                      'count': '${pack.stickers.length}',
                                    }),
                              style: type.caption
                                  .copyWith(color: colors.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      if (!pack.isMine && !pack.isOfficial)
                        PopupMenuButton<String>(
                          icon: AppIcon(
                            AppIcons.moreHorizRounded,
                            color: colors.text,
                          ),
                          onSelected: (_) => showReportSheet(
                            context,
                            ref,
                            ReportTarget.stickerPack,
                            pack.id,
                          ),
                          itemBuilder: (_) => [
                            PopupMenuItem(
                              value: 'report',
                              child: Text(t.t('stickers.reportPack')),
                            ),
                          ],
                        ),
                      if (pack.isMine)
                        PopupMenuButton<String>(
                          icon: AppIcon(
                            AppIcons.moreHorizRounded,
                            color: colors.text,
                          ),
                          onSelected: (v) async {
                            if (v == 'delete') {
                              await _run(() => repo.delete(pack.id));
                              if (context.mounted) Navigator.of(context).pop();
                            }
                          },
                          itemBuilder: (_) => [
                            PopupMenuItem(
                              value: 'delete',
                              child: Text(t.t('stickers.deletePack')),
                            ),
                          ],
                        ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                controller: scroll,
                padding: const EdgeInsets.all(AppSpacing.md),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: AppSpacing.sm,
                  crossAxisSpacing: AppSpacing.sm,
                ),
                itemCount: pack.stickers.length + (pack.isMine ? 1 : 0),
                itemBuilder: (_, i) {
                  if (i == pack.stickers.length) {
                    return AppPressable(
                      onTap: _busy ? null : () => _addSticker(pack),
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: colors.goldStroke),
                          color: colors.goldTint,
                        ),
                        child: Center(
                          child: _busy
                              ? SizedBox.square(
                                  dimension: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: colors.gold,
                                  ),
                                )
                              : AppIcon(
                                  AppIcons.addRounded,
                                  color: colors.goldDark,
                                  size: 30,
                                ),
                        ),
                      ),
                    );
                  }
                  final s = pack.stickers[i];
                  return GestureDetector(
                    onLongPress: pack.isMine
                        ? () => _run(() => repo.deleteSticker(s.id))
                        : null,
                    child: StickerImage(sticker: s, size: 80),
                  );
                },
              ),
            ),
            if (!pack.isMine)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: AppButton(
                    label: pack.installed
                        ? t.t('stickers.remove')
                        : t.t(
                            'stickers.install',
                            {'count': '${pack.stickers.length}'},
                          ),
                    variant: pack.installed
                        ? AppButtonVariant.secondary
                        : AppButtonVariant.primary,
                    isLoading: _busy,
                    onPressed: () => _run(() async {
                      if (pack.installed) {
                        await repo.uninstall(pack.id);
                      } else {
                        await repo.install(pack.id);
                      }
                    }),
                  ),
                ),
              )
            else
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    0,
                    AppSpacing.screenSide,
                    AppSpacing.md,
                  ),
                  child: Text(
                    t.t('stickers.mineHint'),
                    textAlign: TextAlign.center,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
