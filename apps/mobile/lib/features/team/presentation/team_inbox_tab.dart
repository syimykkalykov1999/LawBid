import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';

/// OQ-048 (owner 2026-09-30) — Inbox → «Команда» (the attorney only):
/// approval requests from assistants (approve publishes in the attorney's
/// name). The log of what assistants did lives under the bell.
class TeamInboxTab extends ConsumerStatefulWidget {
  const TeamInboxTab({super.key});

  @override
  ConsumerState<TeamInboxTab> createState() => _TeamInboxTabState();
}

class _TeamInboxTabState extends ConsumerState<TeamInboxTab> {
  final Set<String> _busy = {};

  Future<void> _decide(AssistantRequest r, {required bool approve}) async {
    final t = ref.read(translatorProvider);
    String? note;
    if (!approve) {
      final result = await showDialog<({String? note})>(
        context: context,
        builder: (_) => _RejectDialog(t: t),
      );
      if (result == null) return;
      note = result.note;
    }
    setState(() => _busy.add(r.id));
    try {
      await ref
          .read(teamRequestsProvider.notifier)
          .decide(r.id, approve: approve, note: note);
      if (mounted) {
        showAppSnackBar(
          context,
          t.t(approve ? 'team.approved' : 'team.rejected'),
        );
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy.remove(r.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Column(
      children: [
        // Owner 2026-10-01: Team holds only the requests; the assistants'
        // activity moved to the bell (one place for everything).
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: RefreshIndicator(
            color: colors.gold,
            backgroundColor: colors.surface,
            onRefresh: () => ref.read(teamRequestsProvider.notifier).refresh(),
            child: _requests(t, formats),
          ),
        ),
      ],
    );
  }

  Widget _requests(Object? _, L10nFormats formats) {
    final value = ref.watch(teamRequestsProvider);
    final items = value.value?.items ?? const <AssistantRequest>[];
    if (value.isLoading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (items.isEmpty) {
      return PullableState(
        child: AppEmptyState(
          icon: AppIcons.factCheckOutlined,
          message: ref.read(translatorProvider).t('team.requests.empty'),
        ),
      );
    }
    final sorted = [
      ...items.where((r) => r.status == RequestStatus.pending),
      ...items.where((r) => r.status != RequestStatus.pending),
    ];
    final tr = ref.read(translatorProvider);
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) {
          ref.read(teamRequestsProvider.notifier).loadMore();
        }
        return false;
      },
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.xxl,
        ),
        itemCount: sorted.length,
        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
        itemBuilder: (_, i) {
          final r = sorted[i];
          return AppEntrance(
            index: i,
            child: RequestCard(
              key: ValueKey('request-${r.id}'),
              request: r,
              t: tr,
              formats: formats,
              busy: _busy.contains(r.id),
              onApprove: () => _decide(r, approve: true),
              onReject: () => _decide(r, approve: false),
            ),
          );
        },
      ),
    );
  }
}

/// Reject with an optional note to the assistant (the dialog owns its
/// controller so the closing animation never touches a disposed one).
class _RejectDialog extends StatefulWidget {
  const _RejectDialog({required this.t});

  final Translator t;

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    return AlertDialog(
      title: Text(t.t('team.reject')),
      content: TextField(
        onTapOutside: hideKeyboardOnTapOutside,
        key: const ValueKey('reject-note'),
        controller: _note,
        maxLength: 500,
        maxLines: 3,
        decoration: InputDecoration(hintText: t.t('team.note')),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(t.t('common.cancel')),
        ),
        TextButton(
          key: const ValueKey('reject-confirm'),
          onPressed: () => Navigator.of(context).pop(
              (note: _note.text.trim().isEmpty ? null : _note.text.trim(),)),
          child: Text(t.t('team.reject')),
        ),
      ],
    );
  }
}
