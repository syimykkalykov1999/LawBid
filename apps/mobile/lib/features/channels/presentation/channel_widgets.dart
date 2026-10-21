import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show VerifiedCheck;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:url_launcher/url_launcher.dart';

/// Server codes of channels that [errorText] does not know.
const _usernameTaken = 'CHANNEL_USERNAME_TAKEN';
const _limitReached = 'CHANNEL_LIMIT_REACHED';

/// True for the "this @username is taken" answer.
bool isChannelUsernameTaken(Object error) =>
    error is ApiException && error.code == _usernameTaken;

/// Text for a failed channel call: the channel-specific codes first, then
/// the app's usual [errorText].
String channelErrorText(Translator t, Object error) {
  if (error is ApiException) {
    switch (error.code) {
      case _usernameTaken:
        return t.t('channel.form.usernameTaken');
      case _limitReached:
        return t.t('channel.error.limit');
      case ApiErrorCodes.postNotAllowed:
        return t.t('channel.error.notAllowed');
      case ApiErrorCodes.featureDisabled:
        return t.t('channel.error.disabled');
    }
  }
  return errorText(t, error);
}

/// Wraps a channels screen: with the `channels` flag off the route shows
/// nothing (an empty page with a way back).
class ChannelsGate extends ConsumerWidget {
  const ChannelsGate({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(channelsEnabledProvider)) return child;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Align(
          alignment: AlignmentDirectional.topStart,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: AppSpacing.xs),
            child: AppBackButton(
              semanticLabel: t.t('common.back'),
              onPressed: () => context.canPop()
                  ? context.pop()
                  : Navigator.of(context).maybePop(),
            ),
          ),
        ),
      ),
    );
  }
}

/// A channel's picture, or its first letters.
class ChannelAvatar extends StatelessWidget {
  const ChannelAvatar({
    required this.title,
    required this.size,
    this.url,
    super.key,
  });

  final String title;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final parts = title
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => String.fromCharCode(p.runes.first))
        .join()
        .toUpperCase();
    return AppAvatar(
      size: size,
      initials: parts.isEmpty ? null : parts,
      imageProvider:
          url == null ? null : appNetworkImage(url!, decodeWidthFor(size)),
    );
  }
}

/// A channel in a list: picture, title, @username, subscribers, and whether
/// its owner is verified.
class ChannelRow extends ConsumerWidget {
  const ChannelRow({
    required this.channel,
    required this.onTap,
    this.onLongPress,
    this.picked,
    super.key,
  });

  final Channel channel;
  final VoidCallback onTap;

  /// Owner 2026-10-21: a long press picks the channel (selection mode).
  final VoidCallback? onLongPress;

  /// In selection mode: whether this row is picked (null = not selecting).
  final bool? picked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final subscribers = SocialFormat.plural(
      t,
      f,
      'channel.subscribers',
      channel.subscriberCount,
    );
    final picked = this.picked;
    return Semantics(
      button: true,
      checked: picked,
      label: '${channel.title}, @${channel.username}',
      excludeSemantics: true,
      onTap: onTap,
      onLongPress: onLongPress,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: Container(
          color: picked ?? false ? colors.chip : null,
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                if (picked != null) ...[
                  AppIcon(
                    picked
                        ? AppIcons.checkCircleRounded
                        : AppIcons.radioButtonUncheckedRounded,
                    key: ValueKey('channel-pick-${channel.id}'),
                    color: picked ? colors.iconTint : colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.md),
                ],
                ChannelAvatar(
                  title: channel.title,
                  url: channel.avatarUrl,
                  size: 48,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              channel.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.body.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (channel.owner.verified) ...[
                            const SizedBox(width: AppSpacing.xs),
                            VerifiedCheck(
                              label: t.t('post.verified'),
                              size: 15,
                              gold: true,
                            ),
                          ],
                        ],
                      ),
                      Text(
                        '@${channel.username}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                      Text(
                        subscribers,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (channel.isClosed)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: AppSpacing.sm,
                    ),
                    child: AppIcon(
                      AppIcons.lockOutlineRounded,
                      size: 18,
                      color: colors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

final RegExp _urlRe = RegExp(
  r'(?:https?://|www\.)[^\s<>"]+',
  caseSensitive: false,
);

/// Text with its links tappable (http(s) and www.), the rest as written.
/// Long texts fold to [collapsedLines] with a "more" toggle.
class ChannelLinkedText extends ConsumerStatefulWidget {
  const ChannelLinkedText({
    required this.text,
    this.collapsedLines,
    this.style,
    super.key,
  });

  final String text;
  final TextStyle? style;

  /// Null: always whole.
  final int? collapsedLines;

  @override
  ConsumerState<ChannelLinkedText> createState() => _ChannelLinkedTextState();
}

class _ChannelLinkedTextState extends ConsumerState<ChannelLinkedText> {
  final _recognizers = <TapGestureRecognizer>[];
  bool _open = false;

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  Future<void> _launch(String raw) async {
    final url = raw.toLowerCase().startsWith('www.') ? 'https://$raw' : raw;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Object {
      // No app can open it: the link simply stays text.
    }
  }

  List<InlineSpan> _spans(Color linkColor) {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
    final text = widget.text;
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _urlRe.allMatches(text)) {
      // "see https://a.com." — the closing dot is not part of the link.
      final raw = m.group(0)!;
      final link = raw.replaceFirst(RegExp(r'[.,;:!?)\]]+$'), '');
      if (m.start > last) {
        spans.add(TextSpan(text: text.substring(last, m.start)));
      }
      final r = TapGestureRecognizer()..onTap = () => _launch(link);
      _recognizers.add(r);
      spans.add(
        TextSpan(
          text: link,
          recognizer: r,
          style: TextStyle(
            color: linkColor,
            decoration: TextDecoration.underline,
            decorationColor: linkColor,
          ),
        ),
      );
      last = m.start + link.length;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = (widget.style ?? type.body).copyWith(color: colors.text);
    final lines = widget.collapsedLines;
    final long = lines != null &&
        (widget.text.length > 420 ||
            '\n'.allMatches(widget.text).length >= lines);
    final folded = long && !_open;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(children: _spans(colors.goldDark), style: style),
          maxLines: folded ? lines : null,
          overflow: folded ? TextOverflow.ellipsis : TextOverflow.clip,
        ),
        if (long)
          Semantics(
            button: true,
            child: InkWell(
              onTap: () => setState(() => _open = !_open),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: AppSizes.touchTarget,
                ),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    _open ? t.t('channel.post.less') : t.t('channel.post.more'),
                    style: type.bodySmall.copyWith(
                      color: colors.goldDark,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The empty body of a list: a message, an optional action.
class ChannelsEmpty extends StatelessWidget {
  const ChannelsEmpty({
    required this.message,
    this.title,
    this.icon = AppIcons.campaignOutlined,
    this.action,
    super.key,
  });

  final String message;
  final String? title;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => AppEmptyState(
        title: title,
        message: message,
        icon: icon,
        action: action,
      );
}
