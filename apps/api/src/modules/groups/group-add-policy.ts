import { Injectable } from '@nestjs/common';
import { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';

/**
 * Whether [by] may put [target] into a group chat: the target's "who can
 * add me to groups" privacy setting (owner 2026-10-20). Someone who says no
 * is skipped and reported back as not added; they can still be invited by
 * link.
 */
@Injectable()
export class GroupAddPolicy {
  constructor(private readonly privacy: PrivacySettingsService) {}

  allows(by: string, target: string): Promise<boolean> {
    return this.privacy.allows(by, target, 'group');
  }

  /** Of [targets], those [by] may add (a few queries for the whole list). */
  allowsMany(by: string, targets: string[]): Promise<Set<string>> {
    return this.privacy.allowsMany(by, targets, 'group');
  }
}
