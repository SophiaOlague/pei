import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProductoCarrito } from "./cart-type";
import { useCart } from "./cartcontext";

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    carrito,
    loading,
    resumen,
    incrementarCantidad,
    decrementarCantidad,
    eliminarProducto,
  } = useCart();

  const handleProcederPago = () => {
    if (carrito.length === 0) {
      return;
    }

    router.push({
      params: {
        cantidadProductos: resumen.cantidadTotalProductos.toString(),
        costoEnvio: resumen.costoEnvio.toString(),
        descuento: resumen.descuentoTotal.toString(),
        subtotal: resumen.subtotalBase.toString(),
        total: resumen.total.toString(),
      },
      pathname: "/pago",
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7355F7" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" 
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.sectionTitle}>Productos en tu carrito</Text>

        {carrito.length === 0 ? (
          <View style={styles.emptyCard}>
            <SymbolView
              name={{ android: "shopping_bag", ios: "bag" }}
              size={40}
              tintColor="#D1D5DB"
            />
            <Text style={styles.emptyText}>Tu carrito está vacío</Text>
          </View>
        ) : (
          carrito.map((item: ProductoCarrito) => {
            const tieneOferta =
              item.precioOferta !== undefined &&
              item.precioOferta < item.precioBase;
            const precioEfectivo = item.precioOferta ?? item.precioBase;
            return (
              <View key={item.id} style={styles.productCard}>
                <View style={styles.imagePlaceholder}>
                  <SymbolView
                    name={{ android: "pill", ios: "pill.fill" }}
                    size={28}
                    tintColor="#7355F7"
                  />
                </View>

                <View style={styles.detailsContainer}>
                  <Text style={styles.productName}>{item.nombre}</Text>
                  <Text style={styles.productSubtitle}>
                    {item.subtitulo}
                  </Text>
                  <Text style={styles.presentacionText}>
                    {item.presentacion}
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.productPrice}>
                      ${precioEfectivo.toLocaleString("es-MX")}
                    </Text>
                    {tieneOferta && (
                      <Text style={styles.originalPrice}>
                        ${item.precioBase.toLocaleString("es-MX")}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    onPress={() => eliminarProducto(item.id)}
                    style={styles.deleteButton}
                  >
                    <SymbolView
                      name={{ android: "delete", ios: "trash" }}
                      size={18}
                      tintColor="#EF4444"
                    />
                  </TouchableOpacity>

                  <View style={styles.quantityControls}>
                    <TouchableOpacity
                      onPress={() => decrementarCantidad(item.id)}
                      style={styles.qtyBtn}
                    >
                      <Text style={styles.qtyBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.cantidad}</Text>
                    <TouchableOpacity
                      onPress={() => incrementarCantidad(item.id)}
                      style={styles.qtyBtn}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          Resumen del pedido
        </Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Subtotal ({resumen.cantidadTotalProductos} productos)
            </Text>
            <Text style={styles.summaryValue}>
              ${resumen.subtotalBase.toLocaleString("es-MX")}.00 MXN
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Envío estándar</Text>
            <Text
              style={[
                styles.summaryValue,
                resumen.envioEsGratis && {
                  color: "#16A34A",
                  fontWeight: "700",
                },
              ]}
            >
              {resumen.envioEsGratis
                ? "Gratis"
                : `$${resumen.costoEnvio}.00 MXN`}
            </Text>
          </View>

          {resumen.descuentoTotal > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: "#16A34A" }]}>
                Descuento aplicado
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: "#16A34A", fontWeight: "700" },
                ]}
              >
                -${resumen.descuentoTotal.toLocaleString("es-MX")}.00 MXN
              </Text>
            </View>
          )}

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              ${resumen.total.toLocaleString("es-MX")}.00 MXN
            </Text>
          </View>

          <Pressable style={styles.supportLink}>
            <Text style={styles.supportLinkText}>
              ¿Necesitas ayuda con tu pedido?
            </Text>
          </Pressable>

          <TouchableOpacity activeOpacity={0.7} style={styles.supportButton}>
            <Text style={styles.supportButtonText}>Contactar soporte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footerContainer,
          { paddingBottom: Math.max(insets.bottom + 12, 20) },
        ]}
      >
        <Pressable
          disabled={carrito.length === 0}
          onPress={handleProcederPago}
          style={({ pressed }) => [
            styles.payButton,
            carrito.length === 0 && styles.disabledBtn,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={{ android: "lock", ios: "lock.fill" }}
            size={16}
            tintColor="#FFFFFF"
          />
          <Text style={styles.payButtonText}>Proceder al pago</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    alignItems: "flex-end",
    gap: 8,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  deleteButton: {
    padding: 2,
  },
  detailsContainer: {
    flex: 1,
  },
  disabledBtn: {
    backgroundColor: "#D1D5DB",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    gap: 8,
    padding: 24,
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  footerContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  imagePlaceholder: {
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    height: 50,
    justifyContent: "center",
    marginRight: 12,
    width: 50,
  },
  originalPrice: {
    color: "#9CA3AF",
    fontSize: 12,
    textDecorationLine: "line-through",
  },
  payButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 24,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 14,
  },
  payButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  presentacionText: {
    color: "#9CA3AF",
    fontSize: 10,
    marginVertical: 2,
  },
  pressed: {
    opacity: 0.8,
  },
  priceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  productCard: {
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    flexDirection: "row",
    marginBottom: 10,
    padding: 12,
  },
  productName: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  productPrice: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  productSubtitle: {
    color: "#6B7280",
    fontSize: 11,
  },

  qtyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  qtyBtnText: {
    color: "#7355F7",
    fontSize: 16,
    fontWeight: "600",
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  quantityControls: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
  },
  summaryLabel: {
    color: "#6B7280",
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryValue: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "500",
  },
  supportButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 6,
    paddingVertical: 12,
  },
  supportButtonText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
  },
  supportLink: {
    alignItems: "center",
    marginBottom: 10,
    marginTop: 8,
  },
  supportLinkText: {
    color: "#7355F7",
    fontSize: 12,
  },
  totalLabel: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  totalRow: {
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
    marginBottom: 8,
    marginTop: 4,
    paddingTop: 12,
  },
  totalValue: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
}
);