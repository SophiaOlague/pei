import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
  Pressable,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";

const { width, height } =  Dimensions.get("window");

export default function VideoCallScreen() {
    const [micOn, setMicOn] =   useState(true);
    const [cameraOn, setCameraOn] = useState(true);

    const handeleFinalizar = () => {
        router.back();
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content"/>
            
            <Image
            source={{ uri: "" }}
            style={styles.mainVideo}
            resizeMode="cover"
            />

            <SafeAreaView
            style={styles.topControls} edges={["top"]}>
                <View style={styles.topRow}>

                    <View style={styles.pipContainer}>
                        <Image
                        source={{ uri:"" }}
                        style={styles.pipVideo}
                        resizeMode="cover"
                    />
                    </View>

                    <Pressable>
                        <SymbolView
                        name={{ android: "more_horiz", ios: "ellipsis" }}
                        size={24}
                        tintColor="#FFFFFF"
                        resizeMode="scaleAspectFit"
                        />
                    </Pressable>
                </View>
            </SafeAreaView>
            <View style={styles.bottomControls}>
                <View style={styles.controlsRow}>
                    <View style={styles.controlItem}>
                        <Pressable
                        onPress={() =>setMicOn(!micOn)}
                        style={({ pressed }) => [
                            styles.controlButton,
                            !cameraOn && styles.controlButtonOff,
                            { transform: [{ scale: pressed ? 0.92 : 1 }] },
                        ]}
                        >
                            <SymbolView
                            name={{
                                android: micOn ? "mic" : "mic_off",
                                ios: micOn ? "mic.fill" : "mic.slash.fill",
                            }}
                            size={24}
                            tintColor="#FFFFFF"
                            resizeMode="scaleAspectFit"
                            />
                        </Pressable>
                        <Text style={styles.controlLabel}>Cámara</Text>
                    </View>

                    <View style={styles.controlItem}>
                        <Pressable
                        onPress={() =>setCameraOn(!cameraOn)}
                        style={({ pressed }) => [
                            styles.controlButton,
                            !cameraOn && styles.controlButtonOff,
                            { transform: [{ scale: pressed ? 0.92 : 1 }] },
                        ]}
                        >
                            <SymbolView
                            name={{
                                android: cameraOn ? "videocam" : "videocam_off",
                                ios: cameraOn ? "video.fill" : "video.slash.fill",
                            }}
                            size={24}
                            tintColor="#FFFFFF"
                            resizeMode="scaleAspectFit"
                            />
                        </Pressable>
                        <Text style={styles.controlLabel}>Cámara</Text>
                    </View>

                    <View style={styles.controlItem}>
                        <Pressable
                        onPress={handeleFinalizar}
                        style={({ pressed }) => [
                            styles.finishButton,
                            { transform: [{ scale: pressed ? 0.92 : 1 }] },
                        ]}
                        >
                            <SymbolView
                            name={{ android: "call_end", ios: "phone.down.fill" }}
                            size={24}
                            tintColor="#FFFFFF"
                            resizeMode="scaleAspectFit"
                            />
                        </Pressable>
                        <Text style={styles.controlLabel}>Finalizar</Text>
                    </View>
                </View>
            </View>

        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#928c8c"
    },

    mainVideo: {
        position: "absolute",
        top: 0,
        left: 0,
        width: width,
        height: height,
    },

    topControls: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: 16,
        paddingTop: 8,
    },

    pipContainer: {
        width: 130,
        height: 170,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: "#000000",
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.15)",
    },
    pipVideo: {
        width: "100%",
        height: "100%",
    },

    moreButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
    },

    bottomControls: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 40,
        paddingTop: 20,
        backgroundColor: "rgba(0,0,0,0,0.25)",
    },
    controlsRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
    },
    controlItem: {
        alignItems: "center",
        gap: 8,
    },
    controlButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: "rgba(50,50,50,50,0.85)",
        justifyContent: "center",
        alignItems: "center",
    },
    controlButtonOff: {
        backgroundColor: "#25252550",
    },
    finishButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: "rgba(50,50,50,50,0.85)",
        justifyContent: "center",
        alignItems: "center",
    },
    controlLabel: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "500",
        textShadowColor: "rgba(0,0,0,0,0.6)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
});