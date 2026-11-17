export type CategoriaProducto =
  | "MEDICAMENTO_PREP"
  | "TRATAMIENTO_ARV"
  | "SALUD_SEXUAL"
  | "LABORATORIO";

export interface Producto {
  categoria: CategoriaProducto;
  id: string;
  nombre: string;
  precioBase: number;
  precioOferta?: number;
  presentacion: string;
  requiereReceta: boolean;
  stockDisponible: number;
  subtitulo: string;
}

export interface ProductoCarrito extends Producto {
  cantidad: number;
}

export interface ResumenPedido {
  cantidadTotalProductos: number;
  costoEnvio: number;
  descuentoTotal: number;
  envioEsGratis: boolean;
  montoFaltanteEnvioGratis: number;
  subtotalBase: number;
  total: number;
}

export interface CartContextType {
  agregarAlCarrito: (producto: Producto) => void;
  carrito: ProductoCarrito[];
  decrementarCantidad: (id: string) => void;
  eliminarProducto: (id: string) => void;
  incrementarCantidad: (id: string) => void;
  loading: boolean;
  resumen: ResumenPedido;
  vaciarCarrito: () => void;
}
