import RNFS from "react-native-fs";

// --- küçük yardımcılar ---
const isWhitespace = (ch) => /\s/.test(ch);
const isPunctuation = (ch) => /[!-/:-@[-`{-~]/.test(ch); // ASCII punct
const cleanText = (text) => text.replace(/\u0000/g, "").trim();

// BasicTokenizer: lower-case + whitespace split + punctuation split
function basicTokenize(text, doLowerCase = true) {
  let t = cleanText(text);
  if (doLowerCase) t = t.toLowerCase();

  const tokens = [];
  let buff = "";

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];

    if (isWhitespace(ch)) {
      if (buff) tokens.push(buff);
      buff = "";
      continue;
    }

    if (isPunctuation(ch)) {
      if (buff) tokens.push(buff);
      buff = "";
      tokens.push(ch);
      continue;
    }

    buff += ch;
  }

  if (buff) tokens.push(buff);
  return tokens.filter(Boolean);
}

// WordPiece: greedy longest-match-first
function wordpieceTokenize(token, vocabMap, unkToken = "[UNK]") {
  // Eğer token direkt vocab’da varsa hızlı yol
  if (vocabMap.has(token)) return [token];

  const chars = token.split("");
  const subTokens = [];
  let start = 0;

  while (start < chars.length) {
    let end = chars.length;
    let curSubstr = null;

    while (start < end) {
      let substr = chars.slice(start, end).join("");
      if (start > 0) substr = "##" + substr;

      if (vocabMap.has(substr)) {
        curSubstr = substr;
        break;
      }
      end--;
    }

    if (curSubstr == null) {
      return [unkToken];
    }

    subTokens.push(curSubstr);
    start = end;
  }

  return subTokens;
}

// vocab loader: satır index = token id
async function loadVocab(vocabAssetPath) {
  const vocabText = await RNFS.readFile(vocabAssetPath, "utf8");
  const lines = vocabText.split(/\r?\n/).filter(Boolean);

  const tokenToId = new Map();
  for (let i = 0; i < lines.length; i++) {
    tokenToId.set(lines[i], i);
  }
  return tokenToId;
}

export async function createBertTokenizer({
  vocabPath,               // cihaz içindeki gerçek path
  doLowerCase = true,
  maxLen = 512,
  clsToken = "[CLS]",
  sepToken = "[SEP]",
  padToken = "[PAD]",
  unkToken = "[UNK]",
}) {
  const vocabMap = await loadVocab(vocabPath);

  const clsId = vocabMap.get(clsToken);
  const sepId = vocabMap.get(sepToken);
  const padId = vocabMap.get(padToken);
  const unkId = vocabMap.get(unkToken);

  if ([clsId, sepId, padId, unkId].some((v) => v === undefined)) {
    throw new Error("Özel tokenlar vocab içinde bulunamadı. vocab.txt ilk satırlarını kontrol et.");
  }

  function encode(text) {
    // 1) basic tokenize
    const basic = basicTokenize(text, doLowerCase);

    // 2) wordpiece
    let wp = [];
    for (const tok of basic) {
      wp = wp.concat(wordpieceTokenize(tok, vocabMap, unkToken));
    }

    // 3) [CLS] + tokens + [SEP]
    // maxLen: special tokenları da hesaba kat
    const maxTokens = maxLen - 2;
    if (wp.length > maxTokens) wp = wp.slice(0, maxTokens);

    const tokens = [clsToken, ...wp, sepToken];
    const inputIds = tokens.map((t) => (vocabMap.has(t) ? vocabMap.get(t) : unkId));

    // 4) attention mask (1=real, 0=pad)
    const attentionMask = new Array(inputIds.length).fill(1);

    // 5) padding
    while (inputIds.length < maxLen) {
      inputIds.push(padId);
      attentionMask.push(0);
    }

    // BERT’te genelde token_type_ids da istenir (single sequence için 0)
    const tokenTypeIds = new Array(maxLen).fill(0);

    return {
      tokens,
      inputIds,
      attentionMask,
      tokenTypeIds,
    };
  }

  return { encode, vocabMap };
}
