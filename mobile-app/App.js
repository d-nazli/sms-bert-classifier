import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  PermissionsAndroid,
  Platform,
} from "react-native";

import { ensureTokenizerFiles } from "./src/nlp/assetCopy";
import { createBertTokenizer } from "./src/nlp/tokenizer";
import { runInference } from "./src/onnx/inference";
import { maskText } from "./src/nlp/masker";
import { getInbox, listenIncomingSms } from "./src/sms/smsListener";

// Label mapping (kendi datasetine göre düzenleyebilirsin)
const LABEL_MAP = {
  0: { text: "Dolandırıcılık", color: "#e74c3c" },
  1: { text: "Promosyon", color: "#f1c40f" },
  2: { text: "Normal", color:  "#2ecc71" },
};

export default function App() {
  const [tokenizer, setTokenizer] = useState(null);
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [smsMessages, setSmsMessages] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [hasSmsPermission, setHasSmsPermission] = useState(false);

  // Tokenizer yükle
  useEffect(() => {
    (async () => {
      const { vocabPath } = await ensureTokenizerFiles();
      const tok = await createBertTokenizer({
        vocabPath,
        maxLen: 512,
        doLowerCase: true,
      });
      setTokenizer(tok);
    })();
  }, []);

  // Android SMS izin iste
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);
      const granted = Object.values(res).every(
        (val) => val === PermissionsAndroid.RESULTS.GRANTED
      );
      setHasSmsPermission(granted);
    })();
  }, []);

  // Tokenizer ve izin hazırsa cihaz SMS'lerini al
  useEffect(() => {
    if (!tokenizer || !hasSmsPermission || Platform.OS !== "android") return;
    refreshInbox();
  }, [tokenizer, hasSmsPermission]);

  // Gelen SMS eventlerini dinle
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = listenIncomingSms(async (payload) => {
      if (!tokenizer) return;
      const body = typeof payload === "string" ? payload : payload?.body || "";
      const address =
        typeof payload === "object" && payload?.address
          ? payload.address
          : "Bilinmiyor";
      const timestamp =
        typeof payload === "object" && payload?.timestamp
          ? payload.timestamp
          : Date.now();

      const [classified] = await classifyMessages([
        { body, address, timestamp },
      ]);
      setSmsMessages((prev) =>
        [classified, ...prev].slice(0, 30) // listeyi çok uzatma
      );
    });
    return () => subscription?.remove();
  }, [tokenizer]);

  const analyzeText = async () => {
    if (!inputText.trim() || !tokenizer) return;
    setLoading(true);
    setResult(null);

    try {
      // 1️⃣ Maskele
      const masked = maskText(inputText);
      console.log("🛡️ Maskelenmiş Metin:", masked);

      // 2️⃣ Tokenize
      const encoded = tokenizer.encode(masked);

      // 3️⃣ Model
      const inference = await runInference(encoded);

      const predInfo = LABEL_MAP[inference.predictedLabel];
      const confidence = Math.max(...inference.probs);

      console.log("🤖 Model Tahmini:", {
        label: predInfo.text,
        confidence,
      });

      setResult({
        label: predInfo.text,
        color: predInfo.color,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const classifyMessages = async (messages) => {
    const results = [];
    for (const msg of messages) {
      const masked = maskText(msg.body || "");
      const encoded = tokenizer.encode(masked);
      const inference = await runInference(encoded);
      const predInfo = LABEL_MAP[inference.predictedLabel] || LABEL_MAP[2];
      const confidence = Math.max(...inference.probs);

      results.push({
        ...msg,
        label: predInfo.text,
        color: predInfo.color,
        confidence,
      });
    }
    return results;
  };

  const refreshInbox = async () => {
    if (!tokenizer || !hasSmsPermission) return;
    setSmsLoading(true);
    try {
      const rawMessages = await getInbox(20);
      const classified = await classifyMessages(rawMessages);
      setSmsMessages(classified);
    } catch (err) {
      console.error("SMS okuma hata:", err);
    } finally {
      setSmsLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch (e) {
      return "";
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>📩 SMS / Metin Analizi</Text>
        <Text style={styles.subtitle}>
          Metni gir, AI senin için sınıflandırsın
        </Text>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.inboxHeader}>
          <Text style={styles.cardTitle}>Cihaz SMS'leri</Text>
          <TouchableOpacity
            style={[
              styles.smallButton,
              (!hasSmsPermission || smsLoading) && styles.buttonDisabled,
            ]}
            onPress={refreshInbox}
            disabled={!hasSmsPermission || smsLoading}
            activeOpacity={0.8}
          >
            {smsLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.smallButtonText}>Yenile</Text>
            )}
          </TouchableOpacity>
        </View>
        {Platform.OS !== "android" ? (
          <Text style={styles.infoText}>
            iOS güvenlik politikaları nedeniyle SMS okunamaz.
          </Text>
        ) : !hasSmsPermission ? (
          <Text style={styles.infoText}>
            SMS okumak için izin vermelisin. Lütfen ayarlardan kontrol et.
          </Text>
        ) : smsMessages.length === 0 ? (
          smsLoading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.infoText}>SMS bulunamadı.</Text>
          )
        ) : (
          smsMessages.map((sms) => (
            <View
              key={`${sms.id || sms.timestamp}`}
              style={[styles.smsCard, { borderColor: sms.color || "#dcdde1" }]}
            >
              <View style={styles.smsHeader}>
                <Text style={styles.smsAddress}>{sms.address || "Bilinmiyor"}</Text>
                <Text style={styles.smsDate}>{formatDate(sms.timestamp)}</Text>
              </View>
              <Text style={styles.smsBody}>{sms.body}</Text>
              <View style={styles.smsTag}>
                <Text style={[styles.smsTagText, { color: sms.color }]}>
                  {sms.label}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Mesaj Metni</Text>
        <TextInput
          style={styles.input}
          placeholder="Metni buraya yapıştır veya yaz..."
          placeholderTextColor="#b2bec3"
          multiline
          value={inputText}
          onChangeText={setInputText}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={analyzeText}
          activeOpacity={0.8}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Analiz Et</Text>
          )}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={[styles.resultCard, { borderColor: result.color }]}>
          <Text style={[styles.resultText, { color: result.color }]}>
            🤖 Tahmin: {result.label}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#ecf0f3",
    flexGrow: 1,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    textAlign: "center",
    color: "#636e72",
    marginBottom: 0,
  },
  headerCard: {
    backgroundColor: "#fdfefe",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  inputCard: {
    backgroundColor: "#fdfefe",
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#636e72",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    minHeight: 120,
    textAlignVertical: "top",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  button: {
    backgroundColor: "#3498db",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#3498db",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonDisabled: {
    backgroundColor: "#74b9ff",
    shadowOpacity: 0.1,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  cardTitle: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  cardText: {
    color: "#2f3640",
  },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 2,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  resultText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 6,
  },
  confidence: {
    color: "#636e72",
  },
  inboxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  smallButton: {
    backgroundColor: "#3498db",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  smallButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  infoText: {
    color: "#636e72",
    fontSize: 13,
  },
  smsCard: {
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  smsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  smsAddress: {
    fontWeight: "700",
    color: "#2d3436",
  },
  smsDate: {
    color: "#636e72",
    fontSize: 12,
  },
  smsBody: {
    color: "#2f3640",
    marginBottom: 8,
  },
  smsTag: {
    alignSelf: "flex-start",
    backgroundColor: "#ecf5ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  smsTagText: {
    fontWeight: "700",
  },
});
