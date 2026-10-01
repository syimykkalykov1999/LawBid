import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

String dutyLabel(Translator t, AssistantDuty d) => t.t('duty.${d.wire}');
String dutyHint(Translator t, AssistantDuty d) => t.t('duty.${d.wire}.hint');

IconData dutyIcon(AssistantDuty d) => switch (d) {
      AssistantDuty.calls => AppIcons.callOutlined,
      AssistantDuty.chats => AppIcons.chatBubbleOutlineRounded,
      AssistantDuty.files => AppIcons.attachFileRounded,
      AssistantDuty.cases => AppIcons.workOutlineRounded,
      AssistantDuty.bidDrafts => AppIcons.editNoteRounded,
      AssistantDuty.posts => AppIcons.campaignOutlined,
      AssistantDuty.tasks => AppIcons.eventNoteOutlined,
      AssistantDuty.profile => AppIcons.badgeOutlined,
      AssistantDuty.bids => AppIcons.gavelRounded,
      AssistantDuty.publish => AppIcons.campaignRounded,
    };

String requestKindLabel(Translator t, RequestKind k) =>
    t.t('team.request.${k.wire}');

/// "act.<key>" or the raw action for unknown routes.
String activityLabel(Translator t, String action) {
  final key = 'act.$action';
  final text = t.t(key);
  return text == key ? t.t('act.other', {'action': action}) : text;
}

/// Gold pill "+ Add task" (Mine → Tasks).
class AddTaskButton extends StatelessWidget {
  const AddTaskButton({required this.label, required this.onTap, super.key});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.ctaBright,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(AppIcons.addRounded, size: 20, color: colors.onCtaBright),
              const SizedBox(width: 4),
              Text(
                label,
                style: typography.bodySmall.copyWith(
                  color: colors.onCtaBright,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPillSmall extends StatelessWidget {
  const _StatusPillSmall({required this.status, required this.t});

  final RequestStatus status;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final color = switch (status) {
      RequestStatus.pending => colors.gold,
      RequestStatus.approved => colors.success,
      RequestStatus.rejected => colors.danger,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        t.t('team.request.${status.name}'),
        style: typography.caption
            .copyWith(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// One approval request (owner 2026-10-01 redesign): who asked and when,
/// the status; for a publication a compact preview like a feed card —
/// Post / News, the qualification, the title, the text and the photos;
/// approve / reject while pending.
class RequestCard extends StatelessWidget {
  const RequestCard({
    required this.request,
    required this.t,
    required this.formats,
    this.onApprove,
    this.onReject,
    this.busy = false,
    super.key,
  });

  final AssistantRequest request;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = request;
    final post = r.kind == RequestKind.post;
    final body = post ? r.text('body') : '';
    final pending = r.status == RequestStatus.pending;
    final initials = r.assistantName
        .split(' ')
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();
    Widget chip(String label, {bool gold = false, IconData? icon}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: gold ? colors.goldTint : colors.navy,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: gold ? Border.all(color: colors.goldStroke) : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                AppIcon(icon,
                    size: 13, color: gold ? colors.goldDark : colors.gold),
                const SizedBox(width: 4),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(
                    color: gold ? colors.goldDark : Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        );
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
        boxShadow: [
          BoxShadow(
            color: colors.shadow,
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 17,
                backgroundColor: colors.goldTint,
                child: Text(
                  initials.isEmpty ? '•' : initials,
                  style: typography.caption.copyWith(
                    color: colors.goldDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.assistantName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.bodySmall.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${requestKindLabel(t, r.kind)} · '
                      '${formats.dateTime(r.decidedAt ?? r.createdAt)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              _StatusPillSmall(status: r.status, t: t),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          if (post)
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (r.practiceName != null)
                  chip(r.practiceName!, icon: AppIcons.balanceRounded),
                if (r.isNews)
                  chip(t.t('post.kind.news'),
                      gold: true, icon: AppIcons.newspaperRounded),
              ],
            ),
          if (post) const SizedBox(height: AppSpacing.sm),
          Text(
            r.headline,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: typography.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
          if (body.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              body,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: typography.bodySmall
                  .copyWith(color: colors.textSecondary, height: 1.4),
            ),
          ],
          if (r.mediaUrls.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            SizedBox(
              height: 72,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: r.mediaUrls.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadii.field),
                  child: Image.network(
                    r.mediaUrls[i],
                    width: 72,
                    height: 72,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 72,
                      color: colors.goldTint,
                      child: AppIcon(AppIcons.imageOutlined, color: colors.gold),
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (r.note?.isNotEmpty ?? false) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '“${r.note!}”',
              style: typography.bodySmall.copyWith(
                color: colors.textSecondary,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
          if (pending && onApprove != null) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    key: ValueKey('request-reject-${r.id}'),
                    label: t.t('team.reject'),
                    variant: AppButtonVariant.secondary,
                    height: 44,
                    isLoading: busy,
                    onPressed: onReject,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton(
                    key: ValueKey('request-approve-${r.id}'),
                    label: t.t('team.approve'),
                    icon: AppIcons.checkRounded,
                    height: 44,
                    isLoading: busy,
                    onPressed: onApprove,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// An assistant's answered request in «Результаты».
class RequestResultCard extends StatelessWidget {
  const RequestResultCard({
    required this.request,
    required this.t,
    required this.formats,
    super.key,
  });

  final AssistantRequest request;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) =>
      RequestCard(request: request, t: t, formats: formats);
}

/// One line of the hidden activity log.
class ActivityRow extends StatelessWidget {
  const ActivityRow({
    required this.entry,
    required this.t,
    required this.formats,
    super.key,
  });

  final ActivityEntry entry;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final initials = entry.assistantName
        .split(' ')
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: colors.goldTint,
            child: Text(
              initials.isEmpty ? '•' : initials,
              style: typography.caption.copyWith(
                color: colors.gold,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: entry.assistantName,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      TextSpan(text: ' ${activityLabel(t, entry.action)}'),
                    ],
                  ),
                  style: typography.body.copyWith(color: colors.text),
                ),
                if (entry.summary?.isNotEmpty ?? false)
                  Text(
                    entry.summary!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: typography.bodySmall
                        .copyWith(color: colors.textSecondary),
                  ),
                Text(
                  formats.dateTime(entry.createdAt),
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "You're <attorney>'s assistant" strip (profile, settings).
class AssistantBanner extends StatelessWidget {
  const AssistantBanner({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.sm,
      ),
      color: colors.goldTint,
      child: Row(
        // Owner 2026-10-01: centred.
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppIcon(AppIcons.supportAgentRounded,
              size: AppSizes.iconSm, color: colors.gold),
          const SizedBox(width: AppSpacing.sm),
          Flexible(
            child: Text(
              text,
              textAlign: TextAlign.center,
              style: typography.bodySmall.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// An empty / error state that still pulls to refresh: fills the visible
/// height inside an always-scrollable list.
class PullableState extends StatelessWidget {
  const PullableState({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, c) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: c.maxHeight.isFinite ? c.maxHeight : 480,
              child: child,
            ),
          ],
        ),
      );
}

/// OQ-049 (owner 2026-10-01): switching on any access shows who is
/// responsible — the attorney — and needs an explicit tick. True when the
/// attorney accepted.
Future<bool> askLiability(
  BuildContext context,
  Translator t,
  String duty,
) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (_) => _LiabilityDialog(t: t, duty: duty),
  );
  return ok ?? false;
}

class _LiabilityDialog extends StatefulWidget {
  const _LiabilityDialog({required this.t, required this.duty});

  final Translator t;
  final String duty;

  @override
  State<_LiabilityDialog> createState() => _LiabilityDialogState();
}

class _LiabilityDialogState extends State<_LiabilityDialog> {
  bool _checked = false;

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AlertDialog(
      backgroundColor: colors.surface,
      icon: AppIcon(AppIcons.gavelRounded, color: colors.gold),
      title: Text(t.t('liability.title')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('liability.body', {'duty': widget.duty}),
              style: typography.bodySmall.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            CheckboxListTile(
              key: const ValueKey('liability-check'),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: colors.gold,
              value: _checked,
              onChanged: (v) => setState(() => _checked = v ?? false),
              title: Text(
                t.t('liability.check'),
                style: typography.bodySmall.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(t.t('common.cancel')),
        ),
        FilledButton(
          key: const ValueKey('liability-accept'),
          onPressed: _checked ? () => Navigator.of(context).pop(true) : null,
          child: Text(t.t('liability.accept')),
        ),
      ],
    );
  }
}
