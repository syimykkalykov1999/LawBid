import { Module } from '@nestjs/common';
import { CaseJournalService } from './case-journal.service';

/** docs/02 §4.D case_journal: the hash-chained, append-only case log. */
@Module({
  providers: [CaseJournalService],
  exports: [CaseJournalService],
})
export class JournalModule {}
