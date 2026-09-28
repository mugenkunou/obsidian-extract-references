var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ExtractReferencesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// extract.ts
function extractUrlsFromLine(line) {
  const urls = [];
  const re = /https?:\/\/[^\s)\]>,"'`<]+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const url = cleanTrailing(m[0]);
    if (isValidExternalUrl(url)) {
      urls.push(url);
    }
  }
  return urls;
}
function cleanTrailing(url) {
  return url.replace(/[.,;:!?]+$/, "");
}
function normalize(url) {
  return url.replace(/^https?/i, (m) => m.toLowerCase()).replace(/\/+$/, "");
}
function isValidExternalUrl(url) {
  if (!url || /[<>]/.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname) return false;
    if (/[<>]/.test(parsed.hostname)) return false;
    return true;
  } catch (e) {
    return false;
  }
}
function processContent(content) {
  const lines = content.split("\n");
  const tryToggleFence = (line, state) => {
    var _a;
    const fence = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (!fence) return false;
    const marker = fence[1];
    const trailing = (_a = fence[2]) != null ? _a : "";
    if (!state.inCode) {
      state.inCode = true;
      state.fenceLen = marker.length;
      state.fenceChar = marker[0];
      return true;
    }
    if (marker[0] === state.fenceChar && marker.length >= state.fenceLen && trailing.trim().length === 0) {
      state.inCode = false;
      return true;
    }
    return false;
  };
  let refLineIdx = -1;
  const scanState = { inCode: false, fenceLen: 0, fenceChar: "" };
  for (let i = 0; i < lines.length; i++) {
    if (tryToggleFence(lines[i], scanState)) {
      continue;
    }
    if (scanState.inCode) continue;
    if (/^## reference\s*$/i.test(lines[i])) {
      refLineIdx = i;
    }
  }
  if (refLineIdx === -1 && scanState.inCode) {
    for (let i = 0; i < lines.length; i++) {
      if (/^## reference\s*$/i.test(lines[i])) {
        refLineIdx = i;
      }
    }
  }
  const existingUrls = /* @__PURE__ */ new Set();
  if (refLineIdx !== -1) {
    for (let i = refLineIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) break;
      for (const url of extractUrlsFromLine(lines[i])) {
        existingUrls.add(normalize(url));
      }
    }
  }
  const found = [];
  const extractState = { inCode: false, fenceLen: 0, fenceChar: "" };
  for (let i = 0; i < lines.length; i++) {
    if (tryToggleFence(lines[i], extractState)) {
      continue;
    }
    if (extractState.inCode) continue;
    if (refLineIdx !== -1 && i >= refLineIdx) continue;
    const clean = lines[i].replace(/`[^`]*`/g, "");
    for (const url of extractUrlsFromLine(clean)) {
      found.push(url);
    }
  }
  const seen = new Set(existingUrls);
  const newUrls = [];
  for (const url of found) {
    const key = normalize(url);
    if (!seen.has(key)) {
      seen.add(key);
      newUrls.push(url);
    }
  }
  if (newUrls.length === 0) {
    return null;
  }
  const entries = newUrls.map((u) => `- <${u}>`).join("\n");
  const trimmed = content.replace(/\n+$/, "");
  let result;
  if (refLineIdx !== -1) {
    if (existingUrls.size > 0) {
      result = trimmed + "\n" + entries + "\n";
    } else {
      result = trimmed + "\n\n" + entries + "\n";
    }
  } else {
    result = trimmed + "\n\n## reference\n\n" + entries + "\n";
  }
  return { content: result, added: newUrls.length };
}

// main.ts
var DEFAULT_SETTINGS = {
  autoExtractInterval: 0,
  extractOnStartup: true
};
var ExtractReferencesPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "extract-references-current",
      name: "Extract references from current note",
      callback: () => this.extractFromCurrentNote()
    });
    this.addCommand({
      id: "extract-references-all",
      name: "Extract references from all notes",
      callback: () => this.extractFromAllNotes()
    });
    this.addSettingTab(new ExtractReferencesSettingTab(this.app, this));
    if (this.settings.extractOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        this.extractFromAllNotes(true);
      });
    }
    this.startAutoExtract();
  }
  onunload() {
    this.clearAutoExtract();
  }
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  startAutoExtract() {
    this.clearAutoExtract();
    if (this.settings.autoExtractInterval <= 0) return;
    const ms = this.settings.autoExtractInterval * 60 * 1e3;
    this.autoExtractTimer = window.setInterval(() => {
      this.extractFromAllNotes(true);
    }, ms);
    this.registerInterval(this.autoExtractTimer);
  }
  clearAutoExtract() {
    if (this.autoExtractTimer !== void 0) {
      window.clearInterval(this.autoExtractTimer);
      this.autoExtractTimer = void 0;
    }
  }
  async extractFromCurrentNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian.Notice("No active markdown file");
      return;
    }
    const content = await this.app.vault.read(file);
    const result = processContent(content);
    if (!result) {
      new import_obsidian.Notice("No new references found");
      return;
    }
    await this.app.vault.modify(file, result.content);
    new import_obsidian.Notice(`Added ${result.added} reference(s)`);
  }
  async extractFromAllNotes(silent = false) {
    const files = this.app.vault.getMarkdownFiles();
    let totalAdded = 0;
    let filesChanged = 0;
    for (const file of files) {
      const content = await this.app.vault.read(file);
      const result = processContent(content);
      if (result) {
        await this.app.vault.modify(file, result.content);
        totalAdded += result.added;
        filesChanged++;
      }
    }
    if (totalAdded === 0) {
      if (!silent) new import_obsidian.Notice("No new references found in any note");
    } else {
      new import_obsidian.Notice(
        `Added ${totalAdded} reference(s) across ${filesChanged} note(s)`
      );
    }
  }
};
var ExtractReferencesSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Automatic").setHeading();
    new import_obsidian.Setting(containerEl).setName("Auto extract interval (minutes)").setDesc(
      "Run 'Extract references from all notes' every X minutes. Set to 0 (default) to disable."
    ).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.setPlaceholder("0");
      text.setValue(
        String(this.plugin.settings.autoExtractInterval)
      );
      text.onChange(async (value) => {
        const num = parseInt(value, 10);
        this.plugin.settings.autoExtractInterval = isNaN(num) || num < 0 ? 0 : num;
        await this.plugin.saveSettings();
        this.plugin.startAutoExtract();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Extract on startup").setDesc(
      "Automatically run 'Extract references from all notes' when Obsidian starts."
    ).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.extractOnStartup).onChange(async (value) => {
        this.plugin.settings.extractOnStartup = value;
        await this.plugin.saveSettings();
      });
    });
  }
};
