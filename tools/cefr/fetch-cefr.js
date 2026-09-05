#!/usr/bin/env node
/* 下载开放 CEFR 词汇数据（openlanguageprofiles / oxford3000），供 gen-difficulty.js 使用。
   数据来源（开源）：
     - CEFR-J 英语词汇画像（.csv，A1–B2）：openlanguageprofiles/olp-en-cefrj
     - Octanove C1–C2 扩展（.csv）：openlanguageprofiles/olp-en-cefrj
     - Oxford 3000 CEFR（.json，A1–B2，交叉校验）：Kolia951/The_Oxford_3000_CEFR
   仅用于构建期读取，不进运行时页面。 */
"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");

const OUT = __dirname;
const FILES = [
  {
    url: "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv",
    out: path.join(OUT, "cefrj-vocab.csv")
  },
  {
    url: "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv",
    out: path.join(OUT, "c1c2-vocab.csv")
  },
  {
    url: "https://raw.githubusercontent.com/Kolia951/The_Oxford_3000_CEFR/main/package.txt",
    out: path.join(OUT, "oxford-3000-cefr.json")
  }
];

function get(u) {
  return new Promise(function (res, rej) {
    https.get(u, function (r) {
      if (r.statusCode !== 200) { rej(new Error(u + " -> HTTP " + r.statusCode)); return; }
      let d = "";
      r.on("data", function (c) { d += c; });
      r.on("end", function () { res(d); });
    }).on("error", rej);
  });
}

(async function () {
  for (const f of FILES) {
    const t = await get(f.url);
    fs.writeFileSync(f.out, t, "utf8");
    console.log("OK " + path.basename(f.out) + " (" + t.length + " bytes)");
  }
})().catch(function (e) { console.error("FAIL: " + (e && e.message)); process.exit(1); });
