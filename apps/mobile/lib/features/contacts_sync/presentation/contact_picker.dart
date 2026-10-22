import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_rows.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_states.dart';

/// Reusable "choose a contact" sheet — the LawBid people of the phone book
/// with a search field. Used by "Add to call" and the new-call picker.
/// Several people can be ticked; returns them in the order picked, or null
/// when closed. [excludeUserIds] hides
/// people already in the call.
Future<List<LawBidContact>?> showContactPicker(
  BuildContext context, {
  Set<String> excludeUserIds = const {},
  String? title,
}) =>
    showAppBottomSheet<List<LawBidContact>>(
      context: context,
      isScrollControlled: true,
      closeByHandleOnly: true,
      builder: (_) =>
          ContactPickerSheet(excludeUserIds: excludeUserIds, title: title),
    );

class ContactPickerSheet extends ConsumerStatefulWidget {
  const ContactPickerSheet({
    this.excludeUserIds = const {},
    this.title,
    super.key,
  });

  final Set<String> excludeUserIds;
  final String? title;

  @override
  ConsumerState<ContactPickerSheet> createState() => _ContactPickerSheetState();
}

class _ContactPickerSheetState extends ConsumerState<ContactPickerSheet> {
  String _query = '';
  final _picked = <LawBidContact>[];

  void _toggle(LawBidContact c) => setState(() {
        if (!_picked.remove(c)) _picked.add(c);
      });

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final contacts = ref.watch(phoneContactsProvider);
    final height = MediaQuery.sizeOf(context).height * 0.8;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SizedBox(
          height: height,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: Text(
                  widget.title ?? t.t('phoneContacts.pick'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              if (_picked.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    0,
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                  ),
                  child: Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      for (final c in _picked)
                        InputChip(
                          label: Text(
                            c.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onDeleted: () => _toggle(c),
                        ),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: AppTextField(
                  leading: const AppIcon(AppIcons.searchRounded),
                  hintText: t.t('phoneContacts.search'),
                  semanticLabel: t.t('phoneContacts.search'),
                  onChanged: (v) =>
                      setState(() => _query = v.trim().toLowerCase()),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: contacts.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (_, __) => AppEmptyState(
                    icon: AppIcons.contactPhoneOutlined,
                    message: t.t('error.default.message'),
                    action: AppButton(
                      label: t.t('common.retry'),
                      onPressed: () => ref.invalidate(phoneContactsProvider),
                    ),
                  ),
                  data: (data) {
                    if (data.needsConsent) {
                      return const ContactsConsentView();
                    }
                    if (data.denied) return const ContactsDeniedView();
                    final list = [
                      for (final c in data.onLawBid)
                        if (!widget.excludeUserIds.contains(c.userId) &&
                            (_query.isEmpty ||
                                c.title.toLowerCase().contains(_query) ||
                                (c.person.username ?? '')
                                    .toLowerCase()
                                    .contains(_query)))
                          c,
                    ];
                    if (list.isEmpty) {
                      return AppEmptyState(
                        icon: AppIcons.contactPhoneOutlined,
                        message: t.t(
                          _query.isEmpty
                              ? 'phoneContacts.empty'
                              : 'phoneContacts.noResults',
                        ),
                      );
                    }
                    return ListView.builder(
                      itemCount: list.length,
                      itemBuilder: (context, i) => LawBidContactRow(
                        contact: list[i],
                        onTap: () => _toggle(list[i]),
                        trailing: ContactCheck(on: _picked.contains(list[i])),
                      ),
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                child: AppButton(
                  label: t.t('phoneContacts.add', {
                    'count': '${_picked.length}',
                  }),
                  isEnabled: _picked.isNotEmpty,
                  onPressed: () => Navigator.of(context).pop(List.of(_picked)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
