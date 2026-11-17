import { NativeTabs } from "expo-router/unstable-native-tabs";

import { Colors } from "@/lib/theme";

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Colors.background}
      indicatorColor={Colors.backgroundElement}
      labelStyle={{ selected: { color: Colors.text } }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          renderingMode="template"
          src={require("@/assets/images/tabIcons/home.png")}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="histllamada">
        <NativeTabs.Trigger.Label>Historial</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
        sf="clock.arrow.circlepath"  
        md="history"
      />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lab">
        <NativeTabs.Trigger.Label>Laboratorio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          renderingMode="template"
          src={require("@/assets/images/tabIcons/lab.png")}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="options">
        <NativeTabs.Trigger.Label>Mi perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          renderingMode="template"
          src={require("@/assets/images/tabIcons/user.png")}
        />
      </NativeTabs.Trigger>

      {/*<NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Llamada</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          renderingMode="template"
          src={require("@/assets/images/tabIcons/home.png")}
        />
      </NativeTabs.Trigger>*/}
    </NativeTabs>
  );
}
