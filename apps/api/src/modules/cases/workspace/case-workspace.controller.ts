import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseWorkspaceService } from './case-workspace.service';
import {
  CaseTaskIdParamDto,
  CaseTasksDto,
  CaseUpdateDto,
  CaseWorkspaceDto,
  CreateCaseTaskDto,
  CreateCaseUpdateDto,
  TaskDoneDto,
  TaskSubmissionDto,
  WorkspaceFileDto,
} from './dto/workspace.dto';

const E = ErrorCode;
const ERR = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN],
  404: [E.CASE_NOT_FOUND],
};

/** Owner 2026-10-13: files, tasks and updates of an accepted case. */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseWorkspaceController {
  constructor(private readonly ws: CaseWorkspaceService) {}

  @Get('cases/:id/workspace')
  @ApiOperation({
    summary: 'Files, open tasks and updates of an accepted case',
  })
  @ApiEnvelopeResponse(CaseWorkspaceDto)
  @ApiErrors(ERR)
  caseWorkspace(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.ws.summary(u, p.id);
  }

  @Get('cases/:id/files')
  @ApiOperation({ summary: 'Case files with notes and where they came from' })
  @ApiEnvelopeResponse(WorkspaceFileDto, { isArray: true })
  @ApiErrors(ERR)
  listCaseFiles(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.ws.listFiles(u, p.id);
  }

  @Get('cases/:id/tasks')
  @ApiOperation({
    summary: 'Tasks of an accepted case (private ones: attorney only)',
  })
  @ApiEnvelopeResponse(CaseTasksDto)
  @ApiErrors(ERR)
  listCaseTasks(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.ws.listTasks(u, p.id);
  }

  @Post('cases/:id/tasks')
  @ApiOperation({
    summary: 'Attorney: add a private, shared or for-client task',
  })
  @ApiEnvelopeResponse(CaseTasksDto)
  @ApiErrors(ERR)
  createCaseTask(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: CreateCaseTaskDto,
  ) {
    return this.ws.createTask(u, p.id, dto);
  }

  @Post('cases/:id/tasks/:taskId/done')
  @ApiOperation({
    summary: 'Mark a task done / not done (same for both sides)',
  })
  @ApiEnvelopeResponse(CaseTasksDto)
  @ApiErrors(ERR)
  setCaseTaskDone(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseTaskIdParamDto,
    @Body() dto: TaskDoneDto,
  ) {
    return this.ws.setDone(u, p.id, p.taskId, dto.done);
  }

  @Post('cases/:id/tasks/:taskId/close')
  @ApiOperation({ summary: 'Attorney: close a task for the client' })
  @ApiEnvelopeResponse(CaseTasksDto)
  @ApiErrors(ERR)
  closeCaseTask(@CurrentUser() u: RequestUser, @Param() p: CaseTaskIdParamDto) {
    return this.ws.setClosed(u, p.id, p.taskId, true);
  }

  @Post('cases/:id/tasks/:taskId/reopen')
  @ApiOperation({ summary: 'Attorney: reopen a closed task' })
  @ApiEnvelopeResponse(CaseTasksDto)
  @ApiErrors(ERR)
  reopenCaseTask(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseTaskIdParamDto,
  ) {
    return this.ws.setClosed(u, p.id, p.taskId, false);
  }

  @Post('cases/:id/tasks/:taskId/submissions')
  @ApiOperation({
    summary: 'Client: add a note and files to a task for the client',
  })
  @ApiEnvelopeResponse(CaseTasksDto)
  @ApiErrors(ERR)
  submitCaseTask(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseTaskIdParamDto,
    @Body() dto: TaskSubmissionDto,
  ) {
    return this.ws.submit(u, p.id, p.taskId, dto);
  }

  @Get('cases/:id/updates')
  @ApiOperation({ summary: 'Updates feed of an accepted case' })
  @ApiEnvelopeResponse(CaseUpdateDto, { isArray: true })
  @ApiErrors(ERR)
  listCaseUpdates(@CurrentUser() u: RequestUser, @Param() p: CaseIdParamDto) {
    return this.ws.listUpdates(u, p.id);
  }

  @Post('cases/:id/updates')
  @ApiOperation({ summary: 'Add an update (text and files), either side' })
  @ApiEnvelopeResponse(CaseUpdateDto, { isArray: true })
  @ApiErrors(ERR)
  addCaseUpdate(
    @CurrentUser() u: RequestUser,
    @Param() p: CaseIdParamDto,
    @Body() dto: CreateCaseUpdateDto,
  ) {
    return this.ws.createUpdate(u, p.id, dto);
  }
}
