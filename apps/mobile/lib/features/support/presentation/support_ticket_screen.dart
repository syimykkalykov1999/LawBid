import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/support/application/support_providers.dart';
import 'package:lawbid/features/support/domain/support_models.dart';

/// Owner 2026-10-02 — one request: the conversation with the team, a reply
/// box while it is open, "Close request".
class SupportTicketScreen extends ConsumerStatefulWidget {
  const SupportTicketScreen({required this.ticketId, super.key});

  final String ticketId;

  @override
  ConsumerState<SupportTicketScreen> createState() =>
      _SupportTicketScreenState();
}

class _SupportTicketScreenState extends ConsumerState<SupportTicketScreen> {
  final _text = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(supportTicketProvider(widget.ticketId));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _busy) return;
    await _run(() async {
      await ref.read(supportRepositoryProvider).reply(widget.ticketId, body);
      _text.clear();
    });
  }

  Future<void> _close() => _run(
        () => ref.read(supportRepositoryProvider).close(widget.ticketId),
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(supportTicketProvider(widget.ticketId));

    Widget bubble(SupportMessage m) {
      final team = m.fromTeam;
      return Align(
        alignment: team ? Alignment.centerLeft : Alignment.centerRight,
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * 0.82,
          ),
          margin: const EdgeInsets.only(bottom: AppSpacing.md),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: team ? colors.surface : colors.accent,
            borderRadius: BorderRadius.circular(16),
            border: team ? Border.all(color: colors.goldStroke) : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (team)
                Text(
                  m.authorName ?? t.t('support.team'),
                  style: type.caption.copyWith(
                    color: colors.goldDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              Text(
                m.body,
                style: type.body.copyWith(
                  color: team ? colors.text : colors.onAccent,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                f.dateTime(m.createdAt),
                style: type.caption.copyWith(
                  fontSize: 11,
                  color: (team ? colors.textSecondary : colors.onAccent)
                      .withValues(alpha: 0.7),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(async.value?.subject ?? t.t('support.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          if (async.value?.isOpen ?? false)
            TextButton(
              onPressed: _busy ? null : _close,
              child: Text(t.t('support.close')),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: async.when(
          loading: () =>
              Center(child: CircularProgressIndicator(color: colors.gold)),
          error: (e, _) => AppErrorState(
            message: errorText(t, e),
            retryLabel: t.t('error.retry'),
            onRetry: () =>
                ref.invalidate(supportTicketProvider(widget.ticketId)),
          ),
          data: (ticket) => Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: Text(
                        '${t.t('support.category.${ticket.category.wire}')} · '
                        '${t.t('support.status.${ticket.status.wire}')}',
                        textAlign: TextAlign.center,
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ),
                    for (final m in ticket.messages) bubble(m),
                  ],
                ),
              ),
              if (ticket.canReply)
                Container(
                  color: colors.surface,
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.md,
                    AppSpacing.sm,
                    AppSpacing.sm,
                    AppSpacing.sm,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _text,
                          minLines: 1,
                          maxLines: 5,
                          maxLength: 4000,
                          buildCounter: (
                            _, {
                            required currentLength,
                            required isFocused,
                            maxLength,
                          }) =>
                              null,
                          textCapitalization: TextCapitalization.sentences,
                          style: type.body.copyWith(color: colors.text),
                          decoration: InputDecoration(
                            hintText: t.t('support.reply'),
                            filled: true,
                            fillColor: colors.bg,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(color: colors.border),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(color: colors.border),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(color: colors.gold),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      AppIconButton(
                        icon: AppIcon(
                          AppIcons.arrowUpwardRounded,
                          color: colors.gold,
                        ),
                        semanticLabel: t.t('support.send'),
                        onPressed: _busy ? null : _send,
                      ),
                    ],
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Text(
                    t.t('support.closedNote'),
                    textAlign: TextAlign.center,
                    style: type.bodySmall.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
