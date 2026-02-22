import express from "express";
import fs from "fs";

const app = express();
app.use(express.json({ limit: "5mb" }));

const CHUNK_SIZE = 900;
const state = new Map();

function loadCompanies() {
  const raw = fs.readFileSync("./companies.json", "utf-8");
  return JSON.parse(raw);
}

function splitText(text, size) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    const slice = text.slice(i, end);
    const nl = slice.lastIndexOf("\n");
    if (nl > 200) end = i + nl;
    out.push(text.slice(i, end).trim());
    i = end;
  }
  return out.filter(Boolean);
}

function quickReplies(hasNext) {
  const q = [
    { label: "사용법", action: "message", messageText: "네이버 정보" },
    { label: "처음(⏮)", action: "message", messageText: "처음" }
  ];
  if (hasNext) q.push({ label: "다음(▶)", action: "message", messageText: "다음" });
  return q;
}

function kakaoSimpleText(text, hasNext) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
      quickReplies: quickReplies(hasNext)
    }
  };
}

function extractCompany(utterance) {
  const u = utterance.replace(/\s+/g, " ").trim();
  const idx = u.indexOf("정보");
  if (idx <= 0) return null;
  return u.slice(0, idx).trim();
}

app.post("/", (req, res) => {
  try {
    const body = req.body;
    const utter = (body?.userRequest?.utterance || "").trim();
    const userId = body?.userRequest?.user?.id || "anon";

    const cmd = utter.replace(/\s/g, "");

    if (cmd === "다음") {
      const st = state.get(userId);
      if (!st) return res.json(kakaoSimpleText("먼저 '회사명 정보'로 검색해줘!", false));

      const companies = loadCompanies();
      const record = companies[st.company];
      if (!record) return res.json(kakaoSimpleText("정보를 못 찾았어.", false));

      const chunks = splitText(String(record.full_text || ""), CHUNK_SIZE);
      const nextPage = st.page + 1;

      if (nextPage >= chunks.length) {
        return res.json(kakaoSimpleText("이미 마지막이야.", false));
      }

      st.page = nextPage;
      state.set(userId, st);

      const header = `📌 ${st.company} 정보 [${nextPage + 1}/${chunks.length}]\n🔗 출처: ${record.source_url || ""}\n—\n`;
      const hasNext = nextPage + 1 < chunks.length;
      return res.json(kakaoSimpleText(header + chunks[nextPage], hasNext));
    }

    if (cmd === "처음") {
      state.delete(userId);
      return res.json(kakaoSimpleText("처음부터 다시 보려면 '회사명 정보'를 입력해줘.", false));
    }

    const company = extractCompany(utter);
    if (!company) {
      return res.json(kakaoSimpleText("이렇게 보내줘: 네이버 정보", false));
    }

    const companies = loadCompanies();
    const record = companies[company];
    if (!record) {
      return res.json(kakaoSimpleText("해당 회사 정보를 못 찾았어.", false));
    }

    const chunks = splitText(String(record.full_text || ""), CHUNK_SIZE);
    if (!chunks.length) {
      return res.json(kakaoSimpleText("내용이 비어 있어.", false));
    }

    state.set(userId, { company, page: 0 });

    const header = `📌 ${company} 정보 [1/${chunks.length}]\n🔗 출처: ${record.source_url || ""}\n—\n`;
    const hasNext = chunks.length > 1;
    return res.json(kakaoSimpleText(header + chunks[0], hasNext));

  } catch (e) {
    return res.json(kakaoSimpleText("서버 오류: " + String(e), false));
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running"));
