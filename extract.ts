/**
 * Pure logic for extracting inline references from markdown content.
 * No Obsidian API dependencies — importable by tests.
 */

/** extract all http/https URLs from a single line */
export function extractUrlsFromLine(line: string): string[] {
	const urls: string[] = [];
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

/** strip trailing punctuation that is unlikely part of the URL */
export function cleanTrailing(url: string): string {
	return url.replace(/[.,;:!?]+$/, "");
}

/** normalize URL for dedup comparison */
export function normalize(url: string): string {
	return url
		.replace(/^https?/i, (m) => m.toLowerCase())
		.replace(/\/+$/, "");
}

/** validate extracted URL before using it in reference section */
function isValidExternalUrl(url: string): boolean {
	if (!url || /[<>]/.test(url)) return false;

	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return false;
		}
		if (!parsed.hostname) return false;
		if (/[<>]/.test(parsed.hostname)) return false;
		return true;
	} catch {
		return false;
	}
}

export interface ExtractionResult {
	content: string;
	added: number;
}

/**
 * Process markdown content: extract inline external links and append
 * them to the ## reference section. Returns the new content and the
 * number of URLs added. Returns null if nothing to add.
 */
export function processContent(content: string): ExtractionResult | null {
	const lines = content.split("\n");

	const tryToggleFence = (
		line: string,
		state: { inCode: boolean; fenceLen: number; fenceChar: string }
	): boolean => {
		const fence = line.match(/^(`{3,}|~{3,})(.*)$/);
		if (!fence) return false;

		const marker = fence[1];
		const trailing = fence[2] ?? "";

		if (!state.inCode) {
			state.inCode = true;
			state.fenceLen = marker.length;
			state.fenceChar = marker[0];
			return true;
		}

		// Only close on a bare fence line. This avoids closing on lines like ```bash.
		if (
			marker[0] === state.fenceChar &&
			marker.length >= state.fenceLen &&
			trailing.trim().length === 0
		) {
			state.inCode = false;
			return true;
		}

		return false;
	};

	// --- locate the real ## reference section (skip code blocks) ---
	let refLineIdx = -1;
	const scanState = { inCode: false, fenceLen: 0, fenceChar: "" };

	for (let i = 0; i < lines.length; i++) {
		if (tryToggleFence(lines[i], scanState)) {
			continue;
		}
		if (scanState.inCode) continue;
		if (/^## reference\s*$/i.test(lines[i])) {
			refLineIdx = i; // take the last match
		}
	}

	// Fallback: if fence parsing stayed open, prefer a best-effort heading scan
	// over creating a duplicate reference section.
	if (refLineIdx === -1 && scanState.inCode) {
		for (let i = 0; i < lines.length; i++) {
			if (/^## reference\s*$/i.test(lines[i])) {
				refLineIdx = i;
			}
		}
	}

	// --- collect URLs already in ## reference ---
	const existingUrls = new Set<string>();
	if (refLineIdx !== -1) {
		for (let i = refLineIdx + 1; i < lines.length; i++) {
			if (/^## /.test(lines[i])) break;
			for (const url of extractUrlsFromLine(lines[i])) {
				existingUrls.add(normalize(url));
			}
		}
	}

	// --- extract inline URLs (outside code blocks & reference section) ---
	const found: string[] = [];
	const extractState = { inCode: false, fenceLen: 0, fenceChar: "" };

	for (let i = 0; i < lines.length; i++) {
		if (tryToggleFence(lines[i], extractState)) {
			continue;
		}
		if (extractState.inCode) continue;
		if (refLineIdx !== -1 && i >= refLineIdx) continue;

		// strip inline code spans before extracting
		const clean = lines[i].replace(/`[^`]*`/g, "");
		for (const url of extractUrlsFromLine(clean)) {
			found.push(url);
		}
	}

	// --- deduplicate against existing + self ---
	const seen = new Set<string>(existingUrls);
	const newUrls: string[] = [];
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

	// --- build result ---
	const entries = newUrls.map((u) => `- <${u}>`).join("\n");
	const trimmed = content.replace(/\n+$/, "");
	let result: string;

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
