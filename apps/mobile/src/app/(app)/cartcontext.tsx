import type React from "react";
import { createContext, useContext, useState } from "react";
import type {
  CartContextType,
  Producto,
  ProductoCarrito,
  ResumenPedido,
} from "./cart-type";

const MONTO_MINIMO_ENVIO_GRATIS = 1000;
const COSTO_ENVIO_ESTANDAR = 150;

const PRODUCTOS_INICIALES_CARRITO: ProductoCarrito[] = [
  {
    cantidad: 1,
    categoria: "MEDICAMENTO_PREP",
    id: "prod-prep-001",
    nombre: "TRUVADA",
    precioBase: 2200,
    precioOferta: 1800,
    presentacion: "300mg/200mg — 30 tabletas",
    requiereReceta: true,
    stockDisponible: 15,
    subtitulo: "(Emtricitabina / Tenofovir Disoproxilo)",
  },
  {
    cantidad: 1,
    categoria: "TRATAMIENTO_ARV",
    id: "prod-arv-002",
    nombre: "BIKTARVY",
    precioBase: 6500,
    presentacion: "50mg/200mg/25mg — 30 tabletas",
    requiereReceta: true,
    stockDisponible: 5,
    subtitulo: "(Bictegravir / Emtricitabina / Tenofovir Alafenamida)",
  },
  {
    cantidad: 1,
    categoria: "SALUD_SEXUAL", // O la categoría correspondiente a insumos de apoyo clínico
    id: "prod-salud-003",
    nombre: "SUPLEMENTO DE DENSIDAD ÓSEA (CALCIO + VITAMINA D3)",
    precioBase: 420,
    precioOferta: 350,
    presentacion: "Frasco con 60 cápsulas",
    requiereReceta: false,
    stockDisponible: 30,
    subtitulo: "Monitoreo y protección renal/ósea en terapia PrEP/ARV",
  },
  {
    cantidad: 1,
    categoria: "LABORATORIO",
    id: "prod-lab-004",
    nombre: "PANEL PERIÓDICO DE CONTROL PREP",
    precioBase: 850,
    precioOferta: 700,
    presentacion: "Orden para toma de muestra en laboratorio",
    requiereReceta: true,
    stockDisponible: 50,
    subtitulo: "Laboratorio: Creatinina, Depuración Renal y VDRL",
  },
  {
    cantidad: 1,
    categoria: "MEDICAMENTO_PREP",
    id: "prod-prep-005",
    nombre: "DESCOVY",
    precioBase: 2400,
    presentacion: "200mg/25mg — 30 tabletas",
    requiereReceta: true,
    stockDisponible: 10,
    subtitulo: "(Emtricitabina / Tenofovir Alafenamida)",
  },
  {
    cantidad: 1,
    categoria: "SALUD_SEXUAL",
    id: "prod-salud-006",
    nombre: "VACUNA RECOMBINANTE CONTRA VPH (GARDASIL 9)",
    precioBase: 3800,
    precioOferta: 3500,
    presentacion: "Dosis única — Suspensión inyectable 0.5 mL",
    requiereReceta: true,
    stockDisponible: 8,
    subtitulo: "Prevención de lesiones e infecciones por VPH",
  },
];

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [carrito, setCarrito] = useState<ProductoCarrito[]>(
    PRODUCTOS_INICIALES_CARRITO
  );
  const [loading] = useState<boolean>(false);

  const calcularResumen = (): ResumenPedido => {
    const cantidadTotalProductos = carrito.reduce(
      (acc, p) => acc + p.cantidad,
      0
    );
    const subtotalBase = carrito.reduce(
      (acc, p) => acc + p.precioBase * p.cantidad,
      0
    );

    const descuentoTotal = carrito.reduce((acc, p) => {
      const precioEfectivo = p.precioOferta ?? p.precioBase;
      return acc + (p.precioBase - precioEfectivo) * p.cantidad;
    }, 0);

    const subtotalConDescuento = subtotalBase - descuentoTotal;
    const envioEsGratis =
      subtotalConDescuento >= MONTO_MINIMO_ENVIO_GRATIS || carrito.length === 0;
    const costoEnvio = envioEsGratis ? 0 : COSTO_ENVIO_ESTANDAR;
    const montoFaltanteEnvioGratis = Math.max(
      0,
      MONTO_MINIMO_ENVIO_GRATIS - subtotalConDescuento
    );
    const total = subtotalConDescuento + costoEnvio;

    return {
      cantidadTotalProductos,
      costoEnvio,
      descuentoTotal,
      envioEsGratis,
      montoFaltanteEnvioGratis,
      subtotalBase,
      total,
    };
  };

  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const existe = prev.find((item) => item.id === producto.id);
      if (existe) {
        if (existe.cantidad >= producto.stockDisponible) {
          return prev;
        }
        return prev.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const incrementarCantidad = (id: string) => {
    setCarrito((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (item.cantidad >= item.stockDisponible) {
            return item;
          }
          return { ...item, cantidad: item.cantidad + 1 };
        }
        return item;
      })
    );
  };

  const decrementarCantidad = (id: string) => {
    setCarrito((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, cantidad: item.cantidad - 1 } : item
        )
        .filter((item) => item.cantidad > 0)
    );
  };

  const eliminarProducto = (id: string) => {
    setCarrito((prev) => prev.filter((item) => item.id !== id));
  };

  const vaciarCarrito = () => setCarrito([]);

  return (
    <CartContext.Provider
      value={{
        agregarAlCarrito,
        carrito,
        decrementarCantidad,
        eliminarProducto,
        incrementarCantidad,
        loading,
        resumen: calcularResumen(),
        vaciarCarrito,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart debe ser usado dentro de un CartProvider");
  }
  return context;
}
