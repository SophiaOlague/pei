import { Injectable } from '@nestjs/common';
import { VideoProviderUnavailableError } from '../../domain/video.errors';
import type { VideoProvider } from '../../application/ports/video.ports';

// Proveedor de video sin configurar (decisión 13): falla cerrado. El proveedor no está confirmado en el Maestro y esta
// entrega no integra RealtimeKit. La sala de espera, la admisión, la finalización y las inasistencias funcionan sin él;
// solo la credencial de la llamada (token) responde que la videollamada no está disponible.
@Injectable()
export class UnconfiguredVideoProvider implements VideoProvider {
  readonly name = 'unconfigured';

  async createRoom(): Promise<{ roomId: string }> {
    throw new VideoProviderUnavailableError();
  }

  async issueToken(): Promise<{ token: string; participantId: string }> {
    throw new VideoProviderUnavailableError();
  }

  async revokeAccess(): Promise<void> {
    throw new VideoProviderUnavailableError();
  }
}
