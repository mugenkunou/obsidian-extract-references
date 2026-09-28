# Extract References

an obsidian plugin that extracts inline external links from notes and appends them to the `## reference` section at the bottom. runs on the current note or all notes in the vault. no duplicates.

## quick start

1. `cd .obsidian/plugins/extract-references && npm install && npm run build`
2. obsidian → settings → community plugins → turn off restricted mode → enable "Extract References"
3. settings → hotkeys → search "extract" → bind the commands to hotkeys
4. open any note → press the hotkey → done

## usage

two commands available via command palette (`ctrl/cmd + p`):

- `Extract references from current note` — processes the active note
- `Extract references from all notes` — processes every `.md` file in the vault

## settings

available in **settings → community plugins → extract references → ⚙️**:

| setting | default | description |
| --- | --- | --- |
| auto extract interval (minutes) | 0 (disabled) | run "extract references from all notes" every X minutes. set to 0 to disable. |
| extract on startup | on | run "extract references from all notes" when obsidian starts. |

## what it does

- scans notes for all `http://` and `https://` URLs
- runs on the current note or recursively on every `.md` file in the vault
- skips URLs inside fenced code blocks (``` and ~~~)
- skips URLs inside inline code spans (`` ` ``)
- skips URLs already listed in the `## reference` section
- deduplicates (same URL appearing multiple times inline → added once)
- normalizes trailing slashes and protocol case for comparison
- appends new URLs as `- <URL>` entries to `## reference`
- creates the `## reference` section if it doesn't exist

## URL formats detected

| format | example | extracted |
|---|---|---|
| markdown link | `[text](https://example.com)` | `https://example.com` |
| angle bracket | `<https://example.com>` | `https://example.com` |
| bare URL | `https://example.com` | `https://example.com` |

## assumptions

- `## reference` is the **last** `##` section in the note (matches the vault template)
- only external links (`http/https`) are extracted; obsidian `[[wikilinks]]` are ignored

## build from source

requires node.js and npm.

```bash
cd .obsidian/plugins/extract-references
npm install
npm run build
```

this produces `main.js`. restart obsidian (or reload without restart) to pick up changes.

## install

the plugin lives in `.obsidian/plugins/extract-references/`. obsidian needs three files:

```
.obsidian/plugins/extract-references/
├── main.js        # compiled plugin
├── manifest.json  # plugin metadata
└── styles.css     # (optional, not used)
```

enable it in **settings → community plugins → extract references**.

## mobile

`isDesktopOnly` is set to `false`. the plugin uses only `app.vault.read()` and `app.vault.modify()` — no node.js APIs. works on ios and android.

## development

source file is `main.ts`. edit it, then `npm run build` to recompile. the source files (`main.ts`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`) can be deleted from the plugin directory after building if you want to keep it minimal — only `main.js` and `manifest.json` are needed at runtime.
