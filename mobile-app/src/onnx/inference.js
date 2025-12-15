import * as ort from "onnxruntime-react-native";
import { loadOnnxModel } from "./model";

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
}

export async function runInference(encoded) {
  const session = await loadOnnxModel();

  const inputIds = new ort.Tensor(
    "int64",
    BigInt64Array.from(encoded.inputIds.map(BigInt)),
    [1, encoded.inputIds.length]
  );

  const attentionMask = new ort.Tensor(
    "int64",
    BigInt64Array.from(encoded.attentionMask.map(BigInt)),
    [1, encoded.attentionMask.length]
  );

  const tokenTypeIds = new ort.Tensor(
    "int64",
    BigInt64Array.from(encoded.tokenTypeIds.map(BigInt)),
    [1, encoded.tokenTypeIds.length]
  );

  const outputs = await session.run({
    input_ids: inputIds,
    attention_mask: attentionMask,
    token_type_ids: tokenTypeIds,
  });

  const logits = outputs.logits.data;
  const probs = softmax(Array.from(logits));

  const predicted = probs.indexOf(Math.max(...probs));

  return {
    logits: Array.from(logits),
    probs,
    predictedLabel: predicted,
  };
}
