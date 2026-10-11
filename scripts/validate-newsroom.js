"use strict";
const fs = require("node:fs");
const vm = require("node:vm");

const server = fs.readFileSync("server.js", "utf8");
new vm.Script(server, { filename: "server.js" });

const page = fs.readFileSync("public/newsroom.html", "utf8");
const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error("Newsroom page has no inline JavaScript to validate.");
scripts.forEach((match, index) => new vm.Script(match[1], { filename: "public/newsroom.html script " + (index + 1) }));

const required = [
  "id=\"queue\"", "id=\"confirmVerified\"", "id=\"sourceLinks\"",
  "id=\"publish\"", "id=\"requestChanges\""
];
for (const marker of required) {
  if (!page.includes(marker)) throw new Error("Newsroom UI is missing required control: " + marker);
}
console.log("Newsroom validation passed: server syntax, inline UI JavaScript and core review controls.");
