import { Controller, Get } from '@nestjs/common';
import { GetCurrentLegalDocumentsUseCase } from '../application/use-cases/legal-documents.use-cases';

// RF-03, RF-04: documentos legales vigentes. Público: se leen antes de crear la cuenta.
@Controller('legal-documents')
export class LegalDocumentsController {
  constructor(private readonly currentDocuments: GetCurrentLegalDocumentsUseCase) {}

  @Get('current')
  async current() {
    const documents = await this.currentDocuments.execute();
    return documents.map(({ id, type, version, publishedAt, content }) => ({ id, type, version, publishedAt, content }));
  }
}
