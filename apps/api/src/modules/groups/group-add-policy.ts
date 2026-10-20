import { Injectable } from '@nestjs/common';

/**
 * Whether [by] may put [target] into a group chat. The seam for the
 * "who can add me to groups" privacy setting: once the privacy module
 * (claude/privacy-moderation) is merged this calls
 * `PrivacySettingsService.allows(by, target, 'group')`; until then everyone
 * is addable.
 */
@Injectable()
export class GroupAddPolicy {
  allows(by: string, target: string): Promise<boolean> {
    return Promise.resolve(by !== '' && target !== '');
  }
}
