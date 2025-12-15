import * as ort from "onnxruntime-react-native";
import RNFS from "react-native-fs";
import { Platform } from "react-native";

let session = null;

async function getModelPaths() {
  const targetDir = `${RNFS.DocumentDirectoryPath}/model`;
  const onnxTarget = `${targetDir}/bert_classifier1.onnx`;
  const dataTarget = `${targetDir}/bert_classifier1.onnx.data`;

  if (!(await RNFS.exists(targetDir))) {
    await RNFS.mkdir(targetDir);
  }

  // ✅ HER SEFERİNDE KONTROL ET: ikisi de var mı?
  const onnxExists = await RNFS.exists(onnxTarget);
  const dataExists = await RNFS.exists(dataTarget);

  if (!onnxExists || !dataExists) {
    // Eski/yarım kopyaları temizlemek iyi olur
    if (onnxExists) await RNFS.unlink(onnxTarget);
    if (dataExists) await RNFS.unlink(dataTarget);

    if (Platform.OS === "android") {
      // ⚠️ Android assets’ten ikisini de kopyala
      await RNFS.copyFileAssets("model/bert_classifier1.onnx", onnxTarget);
      await RNFS.copyFileAssets("model/bert_classifier1.onnx.data", dataTarget);
    } else {
      const onnxSrc = `${RNFS.MainBundlePath}/model/bert_classifier1.onnx`;
      const dataSrc = `${RNFS.MainBundlePath}/model/bert_classifier1.onnx.data`;
      await RNFS.copyFile(onnxSrc, onnxTarget);
      await RNFS.copyFile(dataSrc, dataTarget);
    }
  }

  // Debug log: gerçekten kopyalanmış mı?
  console.log("MODEL EXISTS:", {
    onnxTarget,
    dataTarget,
    onnx: await RNFS.exists(onnxTarget),
    data: await RNFS.exists(dataTarget),
  });

  return { onnxTarget };
}

export async function loadOnnxModel() {
  if (session) return session;

  const { onnxTarget } = await getModelPaths();

  session = await ort.InferenceSession.create(onnxTarget, {
    executionProviders: ["cpu"],
  });

  return session;
}
