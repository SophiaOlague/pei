import { Controller, Get, Query } from '@nestjs/common';
import { GetCurrentLegalDocumentsUseCase } from '../application/use-cases/legal-documents.use-cases';
import { CurrentLegalDocumentsQueryDto } from './dto/identity.dto';

// RF-03, RF-04, D-32: documentos legales vigentes del régimen de cada tipo de cuenta. Público: se leen antes de crear la cuenta.
@Controller('legal-documents')
export class LegalDocumentsController {
  constructor(private readonly currentDocuments: GetCurrentLegalDocumentsUseCase) {}

  @Get('current')
  async current(@Query() query: CurrentLegalDocumentsQueryDto) {
    const documents = await this.currentDocuments.execute(query.audience ?? 'patient');
    return documents.map(({ id, type, version, publishedAt, content }) => ({ id, type, version, publishedAt, content }));
  }
}
