import { router } from "expo-router";
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

export default function HomeScreen() {
  const goToRegister = () => {
    router.push("/register");
  };

  const goToLogin = () => {
    router.push("/login");
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Image
            resizeMode="contain"
            source={require("@/assets/images/logo.png")}
            style={styles.logo}
          />

          <View style={styles.textContainer}>
            <Text style={styles.subtitle}>La mejor decisión es cuidarte</Text>
            <Text style={styles.description}>
              En PEI pensamos primero en ti, es seguro, efectivo y está a tu
              alcance.
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable
            onPress={goToRegister}
            style={({ pressed }) => [
              styles.registerButton,
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={styles.registerButtonText}>Registrarme</Text>
          </Pressable>

          <Pressable
            onPress={goToLogin}
            style={({ pressed }) => [
              styles.loginButton,
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Text style={styles.loginButtonText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <Image
        resizeMode="contain"
        source={require("@/assets/images/noise.png")}
        style={styles.overlay}
      />

      <Image
        resizeMode="contain"
        source={require("@/assets/images/back1.png")}
        style={styles.backElement1}
      />
      <Image
        resizeMode="contain"
        source={require("@/assets/images/back2.png")}
        style={styles.backElement2}
      />
      <Image
        resizeMode="contain"
        source={require("@/assets/images/star.png")}
        style={styles.backElement3}
      />
      <Image
        resizeMode="contain"
        source={require("@/assets/images/star2.png")}
        style={styles.backElement4}
      />

      <Image
        resizeMode="contain"
        source={require("@/assets/images/imageinicio.png")}
        style={styles.mainImage}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backElement1: {
    left: 215,
    position: "absolute",
    top: 60,
    zIndex: -1,
  },
  backElement2: {
    left: 0,
    position: "absolute",
    top: 335,
    zIndex: -1,
  },
  backElement3: {
    left: 268,
    position: "absolute",
    top: 295,
    zIndex: -1,
  },
  backElement4: {
    left: 140,
    position: "absolute",
    top: 110,
    zIndex: -1,
  },
  buttonContainer: {
    gap: 10,
    paddingHorizontal: 20,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  description: {
    color: "#ffffff",
    fontSize: 18,
    textAlign: "left",
  },
  loginButton: {
    alignItems: "center",
    backgroundColor: "#D9D9D9",
    borderRadius: 50,
    paddingVertical: 16,
  },
  loginButtonText: {
    color: "#000000",
    fontSize: 18,
    fontWeight: "400",
  },
  logo: {
    height: 33.82,
    marginTop: 20,
    width: 65,
  },
  mainImage: {
    bottom: 0,
    height: height * 0.5,
    left: -width * 0.15,
    position: "absolute",
    width: width * 1.3,
    zIndex: -1,
  },
  overlay: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: -1,
  },
  registerButton: {
    alignItems: "center",
    backgroundColor: "#0BC0BE",
    borderRadius: 50,
    paddingVertical: 16,
  },
  registerButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "400",
  },
  subtitle: {
    color: "#ffffff",
    fontSize: 40,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "left",
  },
  textContainer: {
    marginTop: 50,
  },
});
