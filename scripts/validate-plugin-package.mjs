/**
 * Validate the ChatGPT plugin package and write the submission ZIP.
 *
 * Schemas:
 * - scripts/schemas/agent-plugin.schema.json from https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
 * - scripts/schemas/agent-mcp.schema.json from https://agent-plugins.org/schemas/1.0.0/mcp.schema.json
 * - scripts/schemas/cursor-plugin.schema.json from https://raw.githubusercontent.com/cursor/plugins/main/schemas/plugin.schema.json
 *
 * OpenAI submission limits follow https://developers.openai.com/plugins/deploy/submission
 * and https://developers.openai.com/plugins/deploy/submission-errors
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const RESEARCH_SKILLS = [
  "investigate-product-friction",
  "investigate-user-behavior",
  "run-user-research",
  "validate-with-users",
];
const PACKAGE_SKILLS = ["setup", ...RESEARCH_SKILLS];
const CATEGORIES = [
  "Productivity",
  "Creativity",
  "Developer Tools",
  "Business & Operations",
  "Data & Analytics",
  "Communication",
  "Education & Research",
  "Security",
  "Finance",
  "Healthcare",
  "Travel",
  "Entertainment",
  "Other",
];
const BANNED = [
  "Respondent",
  "Prolific",
  "ElevenLabs",
  "Deepgram",
  "Cartesia",
  "PlayHT",
];
const REQUIRED_PHRASES = [
  "50+ languages",
  "We can recruit participants for you, or you can bring your own.",
  "up to 1 hour",
  "silent observer",
  "Do not create a study until the user agrees.",
];

function fail(message) {
  errors.push(message);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function readSchema(name) {
  return JSON.parse(readFileSync(path.join(root, "scripts/schemas", name), "utf8"));
}

function validateSchema(validator, schema, data, label) {
  const check = validator.compile(schema);
  if (check(data)) return;
  for (const issue of check.errors ?? []) {
    fail(`${label}: ${issue.instancePath || "/"} ${issue.message}`);
  }
}

function walkStrings(value, visit) {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) walkStrings(item, visit);
  }
}

function assertNoBannedCopy(text, label) {
  if (text.includes("\u2014")) fail(`${label} contains an em dash`);
  for (const word of BANNED) {
    if (text.includes(word)) fail(`${label} names ${word}`);
  }
}

function parseSkill(relativePath) {
  const text = readFileSync(path.join(root, relativePath), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
  if (!match) {
    fail(`${relativePath} is missing YAML front matter or a body`);
    return null;
  }
  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const splitAt = line.indexOf(":");
    if (splitAt === -1) continue;
    frontmatter[line.slice(0, splitAt).trim()] = line.slice(splitAt + 1).trim();
  }
  return { text, frontmatter, body: match[2] };
}

function pngSize(relativePath) {
  const bytes = readFileSync(path.join(root, relativePath));
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    fail(`${relativePath} is not a PNG`);
    return;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function assertHttps(value, label) {
  if (typeof value !== "string" || !value.startsWith("https://") || value.includes(" ")) {
    fail(`${label} must be an https URL`);
  }
}

const plugin = readJson("plugin.json");
const mcp = readJson("mcp.json");
const cursorPlugin = readJson(".cursor-plugin/plugin.json");
const npmPackage = readJson("package.json");

const ajv2020 = new Ajv2020({ allErrors: true, strict: false });
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

validateSchema(ajv2020, readSchema("agent-plugin.schema.json"), plugin, "plugin.json");
validateSchema(ajv2020, readSchema("agent-mcp.schema.json"), mcp, "mcp.json");
validateSchema(ajv, readSchema("cursor-plugin.schema.json"), cursorPlugin, ".cursor-plugin/plugin.json");

if (Object.prototype.hasOwnProperty.call(plugin, "logo")) {
  fail("plugin.json must not have a top-level logo. Put it in extensions.com.openai.interface.logo");
}
if (plugin.version === npmPackage.version) {
  fail("plugin.json version must stay separate from package.json");
}
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(plugin.version ?? "")) {
  fail("plugin.json version must be plain semantic version X.Y.Z");
}
if ((plugin.description ?? "").length > 1024) fail("plugin.json description is over 1024 characters");
walkStrings(plugin, (value) => assertNoBannedCopy(value, "plugin.json"));

const openai = plugin.extensions?.["com.openai"];
if (!openai || typeof openai !== "object") fail("plugin.json is missing extensions.com.openai");

const ui = openai?.interface ?? {};
if (ui.displayName !== "Usercall: User Interviews") {
  fail('interface.displayName must stay "Usercall: User Interviews"');
}
if ((ui.displayName ?? "").length > 30) fail("displayName is over 30 characters");
if ((ui.shortDescription ?? "").length === 0 || ui.shortDescription.length > 30) {
  fail("shortDescription must be 1 to 30 characters");
}
if ((ui.longDescription ?? "").length === 0 || ui.longDescription.length > 4000) {
  fail("longDescription must be 1 to 4000 characters");
}
if (!CATEGORIES.includes(ui.category)) fail(`category ${ui.category} is not a supported listing category`);
for (const urlField of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
  assertHttps(ui[urlField], `interface.${urlField}`);
}
if (!Array.isArray(ui.defaultPrompt) || ui.defaultPrompt.length < 1 || ui.defaultPrompt.length > 3) {
  fail("defaultPrompt must be 1 to 3 starter prompts");
}
for (const prompt of ui.defaultPrompt ?? []) {
  if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 128 || prompt.includes("\n") || prompt.includes("@")) {
    fail(`starter prompt is invalid: ${prompt}`);
  }
}
if (new Set(ui.defaultPrompt ?? []).size !== (ui.defaultPrompt ?? []).length) {
  fail("starter prompts must be unique");
}
for (const assetField of ["logo", "composerIcon"]) {
  const assetPath = ui[assetField];
  if (typeof assetPath !== "string" || !assetPath.startsWith("./")) {
    fail(`interface.${assetField} must be a ./ path`);
    continue;
  }
  const size = pngSize(assetPath.slice(2));
  if (!size) continue;
  if (size.width !== size.height || size.width < 48 || size.width > 4096) {
    fail(`interface.${assetField} must be a square PNG from 48 to 4096 pixels`);
  }
}
if (openai?.onboardingSkill !== "./skills/setup/SKILL.md") {
  fail("onboardingSkill must be ./skills/setup/SKILL.md");
}
if (openai?.apps || openai?.hooks) fail("public submission must not declare apps or hooks");

const positive = openai?.review?.test_cases?.positive;
const negative = openai?.review?.test_cases?.negative;
if (!Array.isArray(positive) || positive.length !== 5) fail("review needs exactly 5 positive test cases");
if (!Array.isArray(negative) || negative.length !== 3) fail("review needs exactly 3 negative test cases");
for (const testCase of positive ?? []) {
  for (const field of ["description", "prompt", "tools_triggered", "expected_behavior"]) {
    if (typeof testCase?.[field] !== "string" || testCase[field].trim() === "") {
      fail(`positive test case is missing ${field}`);
    }
  }
  const tools = String(testCase?.tools_triggered ?? "");
  if (tools.split(",").some((tool) => tool.trim() === "create_study")) {
    fail("positive test cases must not depend on create_study");
  }
  if (String(testCase?.prompt ?? "").includes("@")) fail("test prompt must not mention an MCP server");
}
for (const testCase of negative ?? []) {
  if (typeof testCase?.description !== "string" || typeof testCase?.prompt !== "string") {
    fail("each negative test case needs a description and a prompt");
  }
}
if (typeof openai?.publication?.release_notes !== "string" || openai.publication.release_notes.trim() === "") {
  fail("publication.release_notes is required for this submission package");
}
if (openai?.review?.demo_recording_url) {
  assertHttps(openai.review.demo_recording_url, "review.demo_recording_url");
}

if (mcp.mcpServers?.usercall?.url !== "https://mcp.usercall.co") {
  fail("mcp.json must point at https://mcp.usercall.co");
}
if (mcp.mcpServers?.usercall?.type !== "streamable-http") {
  fail("mcp.json usercall transport must be streamable-http");
}

if (cursorPlugin.author?.url) fail("Cursor plugin author.url is not allowed");
if (cursorPlugin.logo !== "assets/logo.png") fail("Cursor plugin logo path changed");
if (cursorPlugin.name !== "usercall") fail("Cursor plugin name changed");

for (const name of PACKAGE_SKILLS) {
  const relativePath = `skills/${name}/SKILL.md`;
  const skill = parseSkill(relativePath);
  if (!skill) continue;
  if (skill.frontmatter.name !== name) fail(`${relativePath} name must be ${name}`);
  const description = skill.frontmatter.description ?? "";
  if (description.length === 0 || description.length > 1024) {
    fail(`${relativePath} description must be 1 to 1024 characters`);
  }
  if (`usercall:${name}`.length > 64) fail(`${name} identity is over 64 characters`);
  if (skill.body.trim().length === 0) fail(`${relativePath} body is empty`);
  assertNoBannedCopy(skill.text, relativePath);
  for (const phrase of REQUIRED_PHRASES) {
    if (!skill.text.includes(phrase)) fail(`${relativePath} is missing: ${phrase}`);
  }
}

const removed = path.join(root, "skills/run-user-interviews/SKILL.md");
try {
  readFileSync(removed);
  fail("skills/run-user-interviews must stay out of the ChatGPT package");
} catch {
  // expected
}

for (const name of RESEARCH_SKILLS) {
  const canonical = readFileSync(path.join(root, "skills", name, "SKILL.md"));
  const copy = readFileSync(path.join(root, "claude-plugin/skills", name, "SKILL.md"));
  if (!canonical.equals(copy)) {
    fail(`claude-plugin/skills/${name}/SKILL.md differs from skills/${name}/SKILL.md`);
  }
}
const claudeSetup = path.join(root, "claude-plugin/skills/setup/SKILL.md");
try {
  readFileSync(claudeSetup);
  fail("setup stays on the ChatGPT package. Do not copy it into claude-plugin");
} catch {
  // expected
}

if (errors.length > 0) {
  for (const message of errors) console.error(`error: ${message}`);
  process.exit(1);
}

const stage = mkdtempSync(path.join(tmpdir(), "usercall-chatgpt-plugin-"));
try {
  const files = ["plugin.json", "mcp.json", "assets/logo.png"];
  for (const name of PACKAGE_SKILLS) files.push(`skills/${name}/SKILL.md`);
  for (const relativePath of files) {
    const source = path.join(root, relativePath);
    const destination = path.join(stage, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
  }
  const zipName = `usercall-chatgpt-plugin-${plugin.version}.zip`;
  const zipPath = path.join(root, "dist", zipName);
  mkdirSync(path.dirname(zipPath), { recursive: true });
  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-X", zipPath, "."], { cwd: stage, stdio: "inherit" });
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const entries = listing.split("\n").filter((line) => line && !line.endsWith("/"));
  const expected = new Set(files);
  for (const entry of entries) {
    if (entry.includes("..") || entry.startsWith("/") || entry.includes("\\")) {
      fail(`zip entry is unsafe: ${entry}`);
    }
    if (!expected.has(entry)) fail(`zip has unexpected file: ${entry}`);
    expected.delete(entry);
  }
  for (const missing of expected) fail(`zip is missing ${missing}`);
  if (errors.length > 0) {
    for (const message of errors) console.error(`error: ${message}`);
    process.exit(1);
  }
  console.log(`validated plugin ${plugin.version}`);
  console.log(`wrote ${path.relative(root, zipPath)}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
