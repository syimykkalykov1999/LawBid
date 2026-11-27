import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/thumb_image.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/cases/workspace/case_files_outbox.dart';
import 'package:material_ui/material_ui.dart';

/// Case audit 26.11 (Telegram / WhatsApp outgoing bubble: sending → sent):
/// an update with files still in the queue, shown at once on top of the
/// History in the same row look as a written update (`UpdateEntry`): «Me»,
/// «Sending» / «Not sent», the text, and each file with its local picture
/// under the 1:1 chat's progress ring. A refused one offers Retry / Delete
/// (the queue's own actions, as the chat's «not sent» bubble). The row goes
/// when the update is written; the server's entry takes its place.
class PendingUpdateEntry extends ConsumerStatefulWidget {
  const PendingUpdateEntry({required this.update, super.key});

  final PendingCaseUpdate update;

  @override
  ConsumerState<PendingUpdateEntry> createState() => _PendingUpdateEntryState();
}

class _PendingUpdateEntryState extends ConsumerState<PendingUpdateEntry> {
  StreamSubscription<UploadProgress>? _sub;
  double _progress = 0;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(uploadQueueProvider).progress.listen((p) {
      if (p.id != widget.update.id || !mounted) return;
      setState(() => _progress = p.value);
    });
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final u = widget.update;
    final failed = u.failed;
    final queue = ref.read(uploadQueueProvider);
    final pct = _progress > 0 && _progress < 1 ? _progress : null;
    return Container(
      key: ValueKey('pending-update-${u.id}'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(size: 36, initials: t.t('cases.updates.me')),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        t.t('cases.updates.me'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      t.t(failed ? 'chat.notSent' : 'chat.state.sending'),
                      style: type.caption.copyWith(
                        color: failed ? colors.danger : colors.textSecondary,
                      ),
                    ),
                  ],
                ),
                if (u.body.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      u.body,
                      style: type.body.copyWith(height: 1.45),
                    ),
                  ),
                for (var i = 0; i < u.files.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: SizedBox.square(
                            dimension: 44,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                if (i < u.previews.length &&
                                    u.previews[i] != null)
                                  Image(
                                    image: thumbImage(
                                      context,
                                      u.previews[i]!,
                                      maxSide: 44,
                                    ),
                                    fit: BoxFit.cover,
                                  )
                                else
                                  ColoredBox(
                                    color: colors.chip,
                                    child: const AppIcon(
                                      AppIcons.descriptionOutlined,
                                    ),
                                  ),
                                // The 1:1 chat's ring while the bytes go up.
                                if (!failed && _progress < 1)
                                  ColoredBox(
                                    color: AppMediaOverlay.scrim,
                                    child: Center(
                                      child: SizedBox.square(
                                        dimension: 24,
                                        child: CircularProgressIndicator(
                                          value: pct,
                                          strokeWidth: 3,
                                          color: AppMediaOverlay.progress,
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            _label(u.files[i]),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (failed)
                  Row(
                    children: [
                      TextButton(
                        key: const ValueKey('pending-update-retry'),
                        onPressed: () => unawaited(queue.retry(u.id)),
                        child: Text(t.t('error.retry')),
                      ),
                      TextButton(
                        key: const ValueKey('pending-update-delete'),
                        onPressed: () => unawaited(queue.discard(u.id)),
                        child: Text(
                          t.t('common.delete'),
                          style: TextStyle(color: colors.danger),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _label(Map<String, Object?> f) {
    final d = (f['description'] as String?)?.trim() ?? '';
    return d.isNotEmpty ? d : (f['name'] as String? ?? '');
  }
}
