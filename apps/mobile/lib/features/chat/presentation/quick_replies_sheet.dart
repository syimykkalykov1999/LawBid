import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/quick_replies_providers.dart';
import 'package:lawbid/features/chat/data/quick_replies_repository.dart';

/// Owner 2026-11-02 (WhatsApp Business): the attorney's ready-made answers.
/// Opens from «/» in the empty composer; a tap on a row returns its text for
/// the composer, the pencil and the bin edit and delete it.
Future<String?> showQuickRepliesSheet(BuildContext context) =>
    showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const QuickRepliesSheet(),
    );

class QuickRepliesSheet extends ConsumerStatefulWidget {
  const QuickRepliesSheet({super.key});

  @override
  ConsumerState<QuickRepliesSheet> createState() => _QuickRepliesSheetState();
}

class _QuickRepliesSheetState extends ConsumerState<QuickRepliesSheet> {
  String _query = '';

  Future<void> _editor(QuickReply? current) async {
    await showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _QuickReplyEditor(current: current),
    );
  }

  Future<void> _delete(QuickReply r) async {
    try {
      await ref.read(quickRepliesProvider.notifier).remove(r.id);
    } on Object catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(errorText(ref.read(translatorProvider), e))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final list = ref.watch(quickRepliesProvider);
    final all = list.value ?? const <QuickReply>[];
    // The search field is shown with many replies only; a query typed
    // before the list shrank must not keep hiding rows.
    final searchable = all.length > 5;
    final rows = [
      for (final r in all)
        if (!searchable || r.matches(_query)) r,
    ];
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.7,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.lg,
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        t.t('quick.title'),
                        style: type.titleMedium.copyWith(color: colors.text),
                      ),
                    ),
                    IconButton(
                      tooltip: t.t('channel.admins.addButton'),
                      onPressed: () => _editor(null),
                      icon: AppIcon(
                        AppIcons.addRounded,
                        color: colors.iconTint,
                      ),
                    ),
                  ],
                ),
              ),
              if (searchable)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                  ),
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v),
                    decoration: InputDecoration(
                      hintText: t.t('common.search'),
                      isDense: true,
                    ),
                  ),
                ),
              Flexible(
                child: rows.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpacing.xl),
                        child: Text(
                          list.isLoading
                              ? ''
                              : list.hasError
                                  ? errorText(t, list.error!)
                                  : all.isEmpty
                                      ? t.t('quick.empty')
                                      : '',
                          style: type.body.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      )
                    : ListView.builder(
                        shrinkWrap: true,
                        itemCount: rows.length,
                        itemBuilder: (context, i) {
                          final r = rows[i];
                          return ListTile(
                            title: Text(
                              r.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              r.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onTap: () => Navigator.of(context).pop(r.body),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  tooltip: t.t('reviews.reply.edit'),
                                  onPressed: () => _editor(r),
                                  icon: AppIcon(
                                    AppIcons.editOutlined,
                                    color: colors.textSecondary,
                                  ),
                                ),
                                IconButton(
                                  tooltip: t.t('common.delete'),
                                  onPressed: () => _delete(r),
                                  icon: AppIcon(
                                    AppIcons.deleteOutlineRounded,
                                    color: colors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickReplyEditor extends ConsumerStatefulWidget {
  const _QuickReplyEditor({required this.current});

  final QuickReply? current;

  @override
  ConsumerState<_QuickReplyEditor> createState() => _QuickReplyEditorState();
}

class _QuickReplyEditorState extends ConsumerState<_QuickReplyEditor> {
  late final _title = TextEditingController(text: widget.current?.title);
  late final _body = TextEditingController(text: widget.current?.body);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  bool get _valid =>
      _title.text.trim().isNotEmpty && _body.text.trim().isNotEmpty;

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final notifier = ref.read(quickRepliesProvider.notifier);
    try {
      final c = widget.current;
      if (c == null) {
        await notifier.add(_title.text.trim(), _body.text.trim());
      } else {
        await notifier.edit(c.id, _title.text.trim(), _body.text.trim());
      }
      if (mounted) Navigator.of(context).pop();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(ref.read(translatorProvider), e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.sm,
          AppSpacing.lg,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _title,
              maxLength: 60,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: t.t('cases.field.title')),
            ),
            TextField(
              controller: _body,
              maxLength: 1000,
              minLines: 3,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: t.t('chat.hint')),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child:
                    Text(_error!, style: TextStyle(color: colors.dangerText)),
              ),
            AppButton(
              label: t.t('common.save'),
              isLoading: _busy,
              isEnabled: _valid,
              onPressed: _busy ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}
