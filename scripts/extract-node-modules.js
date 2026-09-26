#!/usr/bin/env node
/**
 * npmの「新規パッケージ展開」ステップがこの開発環境で動かない問題への回避策。
 * package-lock.jsonに書かれた依存関係を、tarballを直接ダウンロード＆展開する形で
 * node_modulesに配置する。開発時専用のツールで、本番のPWAには一切関係ない。
 *
 * 実行: node scripts/extract-node-modules.js
 */
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const lockPath = path.resolve("package-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf-8"));

const entries = Object.entries(lock.packages).filter(([pkgPath, info]) => pkgPath && info.resolved);

console.log(`${entries.length} 件のパッケージを展開します...`);

// Node の execSync は Windows では既定で cmd.exe を使う。Git Bash（MSYS）を明示的に
// 指定するが、スコープ付きパッケージ名（"@foo/bar"）を含む絶対パスをコマンド文字列に
// そのまま埋め込むと、Node→bash.exe への引数の受け渡しで文字が欠落することがあった
// （"@asamuzakjp/css-color" が丸ごと消えるなど）。そのため cwd を対象ディレクトリに
// 移動し、コマンド自体には相対ファイル名だけを使うようにして回避する。
const BASH = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
const run = (cmd, cwd) => execSync(cmd, { stdio: "inherit", shell: BASH, cwd });

for (const [pkgPath, info] of entries) {
  const targetDir = path.resolve(pkgPath);
  if (existsSync(path.join(targetDir, "package.json"))) {
    console.log(`SKIP  ${pkgPath}（既に展開済み）`);
    continue;
  }
  mkdirSync(targetDir, { recursive: true });
  const tarballUrl = info.resolved;
  const tmpFileName = "__download.tgz";
  run(`curl -sL "${tarballUrl}" -o "${tmpFileName}"`, targetDir);
  run(`tar -xzf "${tmpFileName}" -C . --strip-components=1`, targetDir);
  run(`rm -f "${tmpFileName}"`, targetDir);
  console.log(`OK    ${pkgPath}`);
}

console.log("完了。");
