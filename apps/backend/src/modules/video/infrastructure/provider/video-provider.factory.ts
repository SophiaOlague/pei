import { Logger } from '@nestjs/common';
import type { VideoProvider } from '../../application/ports/video.ports';
import { RealtimeKitVideoProvider, type FetchLike } from './realtimekit-video-provider';
import { loadRealtimeKitConfig, RealtimeKitConfigError } from './realtimekit.config';
import { UnconfiguredVideoProvider } from './unconfigured-video-provider';

// Elige el proveedor de video al arrancar. Sin configuración, o con una parcial o inválida, el backend arranca igual con
// el proveedor sin configurar: la sala, la admisión y las inasistencias siguen funcionando y la credencial de la llamada
// falla cerrada. Nunca se simula una conexión. Los mensajes solo nombran variables, no sus valores.
export function createVideoProvider(env: NodeJS.ProcessEnv = process.env, fetchFn?: FetchLike): VideoProvider {
  const logger = new Logger('VideoProvider');
  try {
    const settings = loadRealtimeKitConfig(env);
    if (!settings) {
      logger.warn('RealtimeKit sin configurar: la videollamada no está disponible');
      return new UnconfiguredVideoProvider();
    }
    return new RealtimeKitVideoProvider(settings, fetchFn);
  } catch (error) {
    if (!(error instanceof RealtimeKitConfigError)) throw error;
    logger.error(`${error.message}. La videollamada no está disponible`);
    return new UnconfiguredVideoProvider();
  }
}
