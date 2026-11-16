import { PaymentProviderError, type PaymentProviderPort, type ProviderName } from '../application/ports/payment-provider.port';
import type { RefundProviderPort } from '../application/ports/refunds.port';

// Proveedor sin configurar: el módulo arranca, pero toda operación falla de forma cerrada (no hay cobro posible).
// `unauthorized` no es reintentable y, en la creación, deja el pago como fallido sin llamar a nadie.
export class UnconfiguredPaymentProvider implements PaymentProviderPort, RefundProviderPort {
  // El nombre es el del proveedor que DEBERÍA estar configurado (por defecto, el histórico).
  constructor(readonly name: ProviderName = 'mercado_pago', private readonly label: string = 'Mercado Pago') {}

  createPayment(): never {
    throw new PaymentProviderError('unauthorized', `${this.label} no está configurado`);
  }

  getPayment(): never {
    throw new PaymentProviderError('unauthorized', `${this.label} no está configurado`);
  }

  // F5: sin configuración, un reembolso queda pendiente (unauthorized no es definitivo) hasta configurar el proveedor.
  createRefund(): never {
    throw new PaymentProviderError('unauthorized', `${this.label} no está configurado`);
  }

  getRefund(): never {
    throw new PaymentProviderError('unauthorized', `${this.label} no está configurado`);
  }
}
