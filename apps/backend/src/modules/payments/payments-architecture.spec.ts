import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

// Payments: el dominio no depende del proveedor. Solo el adaptador de cada proveedor conoce su API. Stripe es el
// proveedor ACTIVO de ambos checkouts; Mercado Pago se conserva sin registrar (Payments-decisiones.md §8). Analiza el
// código fuente; no ejecuta nada.
const SRC = join(__dirname, '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
const files = walk(SRC).map((p) => ({ path: relative(SRC, p).split(sep).join('/'), source: readFileSync(p, 'utf8') }));
const imports = (source: string) => [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
const ADAPTER = 'modules/payments/infrastructure/mercadopago/mercadopago-payment-provider.ts';
const STRIPE_ADAPTER = 'modules/payments/infrastructure/stripe/stripe-payment-provider.ts';
const MODULE = 'modules/payments/payments.module.ts';
const code = (path: string) => files.find((f) => f.path === path)!.source.replace(/\/\/.*$/gm, '');
const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

describe('Payments · arquitectura', () => {
  it('solo el adaptador conoce la API de Mercado Pago', () => {
    expect(files.filter((f) => /mercadopago\.com/i.test(f.source)).map((f) => f.path)).toEqual([ADAPTER]);
  });

  it('no se usa el SDK de Mercado Pago (sin dependencia nueva)', () => {
    expect(files.filter((f) => imports(f.source).some((i) => /^mercadopago(\/|$)/.test(i))).map((f) => f.path)).toEqual([]);
    expect(dependencies.filter((d) => /mercadopago/i.test(d))).toEqual([]);
  });

  it('solo el adaptador de Stripe conoce la API de Stripe', () => {
    expect(files.filter((f) => /api\.stripe\.com/i.test(f.source)).map((f) => f.path)).toEqual([STRIPE_ADAPTER]);
    // Las rutas de la API (/v1/payment_intents, /v1/refunds) tampoco aparecen en el código de ningún otro archivo.
    const others = files.filter((f) => f.path !== STRIPE_ADAPTER && /\/v1\/(payment_intents|refunds|charges|checkout)/.test(f.source.replace(/\/\/.*$/gm, '')));
    expect(others.map((f) => f.path)).toEqual([]);
  });

  it('no se usa el SDK de Stripe (sin dependencia nueva)', () => {
    expect(files.filter((f) => imports(f.source).some((i) => /^(stripe|@stripe\/)/.test(i))).map((f) => f.path)).toEqual([]);
    expect(dependencies.filter((d) => /stripe/i.test(d))).toEqual([]);
  });

  it('el dominio y la aplicación de pagos no importan infraestructura, la base de datos ni Nest', () => {
    const inner = files.filter((f) => /^modules\/payments\/(domain|application)\//.test(f.path));
    expect(inner.length).toBeGreaterThan(0);
    const offenders = inner.flatMap((f) => imports(f.source).filter((i) => /infrastructure|\/db(\/|$)|@nestjs|drizzle|@neondatabase/.test(i)).map((i) => `${f.path} → ${i}`));
    expect(offenders).toEqual([]);
  });

  it('ningún otro módulo importa la infraestructura de pagos', () => {
    const offenders = files
      .filter((f) => !f.path.startsWith('modules/payments/'))
      .filter((f) => imports(f.source).some((i) => /payments\/infrastructure\//.test(i)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('el adaptador no envía datos de tarjeta ni campos de split o cuentas vinculadas', () => {
    // Solo el código: los comentarios del adaptador nombran esos campos para decir que no se usan.
    expect(code(ADAPTER)).not.toMatch(/card_number|security_code|cvv|marketplace_fee|application_fee|collector_id/i);
  });

  it('el adaptador de Stripe no envía datos de tarjeta, ni usa Connect, transferencias o comisiones de aplicación', () => {
    expect(code(STRIPE_ADAPTER)).not.toMatch(/card\[|\[number\]|\bcvc\b|exp_month|exp_year|application_fee|transfer_data|on_behalf_of|transfer_group|stripe-account|customer|receipt_email/i);
  });

  it('Stripe es el único proveedor registrado: el módulo no importa ni cablea nada de Mercado Pago', () => {
    const module = files.find((f) => f.path === MODULE)!;
    expect(imports(module.source).filter((i) => /mercado/i.test(i))).toEqual([]);
    expect(code(MODULE)).not.toMatch(/MercadoPago|MERCADO_PAGO|mercado_pago/);
    expect(imports(module.source)).toEqual(expect.arrayContaining([
      './infrastructure/stripe/stripe.config', './infrastructure/stripe/stripe-payment-provider', './infrastructure/stripe/stripe-webhook-authenticator', './presentation/stripe-webhook.controller',
    ]));
  });

  it('la integración de Mercado Pago se conserva en el repositorio (desactivada, no eliminada)', () => {
    const kept = files.map((f) => f.path).filter((p) => /mercado-?pago/i.test(p)).sort();
    expect(kept).toEqual([
      'modules/payments/infrastructure/mercadopago/mercadopago-payment-provider.ts',
      'modules/payments/infrastructure/mercadopago/mercadopago-webhook-authenticator.ts',
      'modules/payments/infrastructure/mercadopago/mercadopago-webhook.config.ts',
      'modules/payments/infrastructure/mercadopago/mercadopago.config.ts',
      'modules/payments/presentation/mercado-pago-webhook.controller.ts',
    ]);
    // Nadie fuera de su propia carpeta (y de su controlador) la importa.
    const users = files.filter((f) => !/mercado-?pago/i.test(f.path) && imports(f.source).some((i) => /mercado-?pago/i.test(i))).map((f) => f.path);
    expect(users).toEqual([]);
  });

  it('ningún secreto de Stripe está escrito en el código ni en los ejemplos de entorno', () => {
    const SECRET = /(sk|rk)_(test|live)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/;
    expect(files.filter((f) => SECRET.test(f.source)).map((f) => f.path)).toEqual([]);
    const example = readFileSync(join(SRC, '..', '.env.example'), 'utf8');
    expect(SECRET.test(example)).toBe(false);
    // Las variables sensibles van vacías en el ejemplo; la tolerancia no es un secreto y puede traer un valor.
    for (const name of ['STRIPE_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_ALLOW_LIVE', 'STRIPE_WEBHOOK_SECRET']) {
      expect(example).toMatch(new RegExp(`^${name}=\\s*$`, 'm'));
    }
    expect(example).toMatch(/^STRIPE_WEBHOOK_TOLERANCE_SECONDS=\d*\s*$/m);
  });
});
