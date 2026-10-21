import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_section.dart';

/// Telegram's admin checkboxes, in the order the sheet lists them.
const kGroupAdminRights = <String>[
  'info',
  'delete',
  'ban',
  'invite',
  'pin',
  'calls',
  'admins',
];

IconData _icon(String right) => switch (right) {
      'info' => AppIcons.editOutlined,
      'delete' => AppIcons.deleteOutlineRounded,
      'ban' => AppIcons.removeCircleOutlineRounded,
      'invite' => AppIcons.personAddAlt1Rounded,
      'pin' => AppIcons.pushPinOutlined,
      'calls' => AppIcons.callOutlined,
      _ => AppIcons.adminPanelSettingsOutlined,
    };

String _label(Translator t, String right) => t.t(
      switch (right) {
        'info' => 'group.info.settings.whoEdit',
        'delete' => 'group.right.delete',
        'ban' => 'group.right.ban',
        'invite' => 'group.info.settings.whoAdd',
        'pin' => 'group.right.pin',
        'calls' => 'group.info.settings.whoCall',
        _ => 'group.right.admins',
      },
    );

/// The admin checkboxes of [name]. [allowed] are the ones I may hand out
/// (the owner: all); [initial] the ones already set. Returns the ticked
/// rights, or null when dismissed.
Future<List<String>?> showGroupAdminRightsSheet(
  BuildContext context, {
  required String name,
  required List<String> allowed,
  required List<String> initial,
}) =>
    showAppBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _RightsSheet(
        name: name,
        allowed: allowed,
        initial: initial,
      ),
    );

class _RightsSheet extends ConsumerStatefulWidget {
  const _RightsSheet({
    required this.name,
    required this.allowed,
    required this.initial,
  });

  final String name;
  final List<String> allowed;
  final List<String> initial;

  @override
  ConsumerState<_RightsSheet> createState() => _RightsSheetState();
}

class _RightsSheetState extends ConsumerState<_RightsSheet> {
  late final Set<String> _on = {...widget.initial};

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Text(
                '${t.t('group.info.member.rights')} · ${widget.name}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            GroupInfoSection(
              children: [
                for (final right in kGroupAdminRights)
                  GroupInfoSwitchRow(
                    key: ValueKey('right-$right'),
                    icon: _icon(right),
                    label: _label(t, right),
                    value: _on.contains(right),
                    onChanged: widget.allowed.contains(right)
                        ? (v) => setState(
                              () => v ? _on.add(right) : _on.remove(right),
                            )
                        : null,
                  ),
              ],
            ),
            AppButton(
              key: const ValueKey('rights-save'),
              label: t.t('group.topic.save'),
              onPressed: () => Navigator.of(context).pop(
                [
                  for (final r in kGroupAdminRights)
                    if (_on.contains(r)) r,
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
