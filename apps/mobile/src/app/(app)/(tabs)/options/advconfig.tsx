import React, { useState } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { router } from "expo-router";

interface MenuItemProps {
  icon: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
}

function MenuItem({ icon, label, onPress }: MenuItemProps) {
const isDestructive = label === "Eliminar cuenta";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.menuItem}
      onPress={onPress}
    >
      <View style={styles.menuItemLeft}>
        <SymbolView 
        name={icon} 
        size={22} 
        tintColor={isDestructive ? "#EF4444" : "#616161"}
        />
        <Text 
        style={[
          styles.menuItemText,
          isDestructive && styles.textDestructive
        ]}
        >
        {label}
        </Text>
        </View>
        <SymbolView
        name={{ android: "chevron_right", ios: "chevron.right" }}
        size={20}
        tintColor={isDestructive ? "#EF4444" : "#8E8E93"}
      />
    </TouchableOpacity>
  );
}

interface SettingItem {
  id: string;
  label: string;
}

const SETTINGS_OPTIONS: SettingItem[] = [
  { id: "camera", label: "Permitir acceso a mi cámara" },
  { id: "noti", label: "Permitir notificaciones" },
  { id: "docs", label: "Permitir acceso a mi expediente" },
];

export default function AdvConfigScreen() {
  const [switchesState, setSwitchesState] = useState<Record<string, boolean>>({
    camera: true,
    noti: true,
    docs: true,
  });

  const toggleSwitch = (id: string) => {
    setSwitchesState((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  const handleDeleteAccount = () => {
    router.push("/(app)/deleteaccount");
  };

  const handleLogout = () => {
    router.push("/(app)/logout");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom", "left", "right"]}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingsList}>
          {SETTINGS_OPTIONS.map((item) => (
            <View key={item.id} style={styles.settingRow}>
              <Text style={styles.label}>{item.label}</Text>
              <Switch
                ios_backgroundColor="#E9E9EA"
                onValueChange={() => toggleSwitch(item.id)}
                thumbColor="#FFFFFF"
                trackColor={{ false: "#E9E9EA", true: "#7000FF" }}
                value={switchesState[item.id]}
              />
            </View>
          ))}
        </View>

        <View style={styles.menuActionsGroup}>
          <MenuItem
            icon={{
              android: "logout",
              ios: "rectangle.portrait.and.arrow.right",
            }}
            label="Cerrar sesión"
            onPress={handleLogout}
          />
          <MenuItem
            icon={{
              android: "delete",
              ios: "trash",
            }}
            label="Eliminar cuenta"
            onPress={handleDeleteAccount}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#8E8E93",
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingRight: 16,
  },
  menuActionsGroup: {
    borderTopColor: "#F2F2F7",
    borderTopWidth: 2,
    marginTop: 24,
    paddingTop: 28,
    gap: 20,
  },
  menuItem: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  menuItemLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 28,
  },
  menuItemText: {
    color: "#616161",
    fontSize: 16,
    fontWeight: "500",
  },
  textDestructive: {
    color: "#EF4444",
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  settingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  settingsList: {
    gap: 16,
  },
});