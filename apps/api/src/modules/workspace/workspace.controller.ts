import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import {
  AdminEndpoint,
  ALL_ADMIN_ROLES,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { MyRewardsDto } from '../rewards/rewards.dto';
import { WorkspaceDto } from './workspace.dto';
import { WorkspaceService } from './workspace.service';

/** Owner 2026-10-05: «Рабочее место» — open to every admin; it only ever
 * lists what the admin's own areas allow. */
@ApiTags('admin-workspace')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get()
  @ApiOperation({ summary: 'My queues: how much waits, what is late' })
  @ApiEnvelopeResponse(WorkspaceDto)
  getWorkspace(@CurrentAdmin() admin: AdminActor): Promise<WorkspaceDto> {
    return this.workspace.forAdmin(admin);
  }

  @Get('rewards')
  @ApiOperation({
    summary:
      '«Лучший сотрудник»: my place per department (enabled=false when off)',
  })
  @ApiEnvelopeResponse(MyRewardsDto)
  getMyRewards(@CurrentAdmin() admin: AdminActor): Promise<MyRewardsDto> {
    return this.workspace.myRewards(admin);
  }
}
