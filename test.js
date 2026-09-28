/**
 * Test suite for extract-references plugin.
 *
 * Run: npm test
 * Requires: node esbuild.test.mjs (builds extract.js) then node test.js
 */

const {
	extractUrlsFromLine,
	cleanTrailing,
	normalize,
	processContent,
} = require("./extract.js");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
	if (condition) {
		passed++;
	} else {
		failed++;
		failures.push(msg);
		console.error(`  ✗ ${msg}`);
	}
}

function assertEq(actual, expected, msg) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		passed++;
	} else {
		failed++;
		failures.push(`${msg}\n    expected: ${e}\n    actual:   ${a}`);
		console.error(`  ✗ ${msg}`);
		console.error(`    expected: ${e}`);
		console.error(`    actual:   ${a}`);
	}
}

function section(name) {
	console.log(`\n── ${name} ──`);
}

// ============================================================
// extractUrlsFromLine
// ============================================================
section("extractUrlsFromLine");

assertEq(
	extractUrlsFromLine("check [this](https://example.com/path) out"),
	["https://example.com/path"],
	"markdown link"
);

assertEq(
	extractUrlsFromLine("visit <https://example.com>"),
	["https://example.com"],
	"angle bracket link"
);

assertEq(
	extractUrlsFromLine("bare https://example.com/page in text"),
	["https://example.com/page"],
	"bare URL"
);

assertEq(
	extractUrlsFromLine("http://foo.com and https://bar.com"),
	["http://foo.com", "https://bar.com"],
	"multiple URLs on one line"
);

assertEq(
	extractUrlsFromLine("no links here"),
	[],
	"no URLs"
);

assertEq(
	extractUrlsFromLine(""),
	[],
	"empty line"
);

assertEq(
	extractUrlsFromLine("[ref](https://sysdig.com/blog/image-scanning-admission-controller/). (policies are hard)"),
	["https://sysdig.com/blog/image-scanning-admission-controller/"],
	"URL followed by period and paren — real vault pattern"
);

assertEq(
	extractUrlsFromLine("2. why do you need last applied configuration <https://chatgpt.com/c/68b97f76-ef68-8332-9a11-b3bc1699ea87>"),
	["https://chatgpt.com/c/68b97f76-ef68-8332-9a11-b3bc1699ea87"],
	"angle bracket URL in numbered list"
);

assertEq(
	extractUrlsFromLine("- <https://stackoverflow.com/a/38723094/11586504>"),
	["https://stackoverflow.com/a/38723094/11586504"],
	"reference-style bullet URL"
);

assertEq(
	extractUrlsFromLine("[link](https://unix.stackexchange.com/questions/466999/what-does-exec-do)"),
	["https://unix.stackexchange.com/questions/466999/what-does-exec-do"],
	"markdown link with [link] text — real vault pattern"
);

assertEq(
	extractUrlsFromLine("while true; do curl -m 2 http://<server-ip>:8080; sleep 1; done"),
	[],
	"placeholder host in angle brackets is ignored"
);

// ============================================================
// cleanTrailing
// ============================================================
section("cleanTrailing");

assertEq(cleanTrailing("https://example.com."), "https://example.com", "trailing dot");
assertEq(cleanTrailing("https://example.com,"), "https://example.com", "trailing comma");
assertEq(cleanTrailing("https://example.com;"), "https://example.com", "trailing semicolon");
assertEq(cleanTrailing("https://example.com!"), "https://example.com", "trailing exclamation");
assertEq(cleanTrailing("https://example.com?query=1"), "https://example.com?query=1", "question mark in query string preserved");
assertEq(cleanTrailing("https://example.com"), "https://example.com", "no trailing punctuation");

// ============================================================
// normalize
// ============================================================
section("normalize");

assertEq(normalize("https://example.com/"), "https://example.com", "trailing slash stripped");
assertEq(normalize("https://example.com///"), "https://example.com", "multiple trailing slashes stripped");
assertEq(normalize("HTTPS://Example.com"), "https://Example.com", "protocol lowercased");
assertEq(normalize("http://example.com"), "http://example.com", "http preserved");
assertEq(
	normalize("https://example.com/path"),
	normalize("https://example.com/path/"),
	"trailing slash equivalence"
);

// ============================================================
// processContent — basic cases
// ============================================================
section("processContent — basic");

// no URLs at all
assert(
	processContent("# hello\n\nsome text\n") === null,
	"no URLs → returns null"
);

// single URL, no reference section
{
	const input = "# note\n\ncheck https://example.com out\n";
	const result = processContent(input);
	assert(result !== null, "single URL → not null");
	assert(result.added === 1, "single URL → added 1");
	assert(result.content.includes("## reference"), "creates ## reference section");
	assert(result.content.includes("- <https://example.com>"), "appends URL in correct format");
}

// existing reference section — empty
{
	const input = "# note\n\nhttps://example.com\n\n## reference\n";
	const result = processContent(input);
	assert(result !== null, "empty ref section → not null");
	assert(result.added === 1, "empty ref section → added 1");
	assert(result.content.includes("- <https://example.com>"), "URL appended under empty ## reference");
}

// existing reference section — with entries
{
	const input = "# note\n\nhttps://new.com here\n\n## reference\n\n- <https://old.com>\n";
	const result = processContent(input);
	assert(result !== null, "existing entries → not null");
	assert(result.added === 1, "existing entries → added 1");
	assert(result.content.includes("- <https://old.com>"), "old entry preserved");
	assert(result.content.includes("- <https://new.com>"), "new entry added");
}

// ============================================================
// processContent — deduplication
// ============================================================
section("processContent — deduplication");

// duplicate inline URLs
{
	const input = "https://example.com and https://example.com again\n";
	const result = processContent(input);
	assert(result.added === 1, "inline duplicate → added once");
}

// URL already in reference section
{
	const input = "https://example.com inline\n\n## reference\n\n- <https://example.com>\n";
	const result = processContent(input);
	assert(result === null, "URL already in ref → null");
}

// trailing slash normalization dedup
{
	const input = "https://example.com/ inline\n\n## reference\n\n- <https://example.com>\n";
	const result = processContent(input);
	assert(result === null, "trailing slash dedup → null");
}

// ============================================================
// processContent — code block skipping
// ============================================================
section("processContent — code block skipping");

// fenced code block (backtick)
{
	const input = "# note\n\n```\nhttps://inside-code.com\n```\n\nhttps://outside.com\n";
	const result = processContent(input);
	assert(result !== null, "code block test → not null");
	assert(result.added === 1, "code block → only outside URL added");
	assert(!result.content.includes("- <https://inside-code.com>"), "URL inside code block skipped");
	assert(result.content.includes("- <https://outside.com>"), "URL outside code block added");
}

// fenced code block (tilde)
{
	const input = "# note\n\n~~~\nhttps://tilde-code.com\n~~~\n\nhttps://outside.com\n";
	const result = processContent(input);
	assert(result.added === 1, "tilde fence → only outside URL");
	assert(!result.content.includes("- <https://tilde-code.com>"), "URL inside tilde fence skipped");
}

// four-backtick fence (longer fence)
{
	const input = "````\nhttps://deep-fence.com\n````\nhttps://real.com\n";
	const result = processContent(input);
	assert(result.added === 1, "4-backtick fence → only outside URL");
	assert(!result.content.includes("- <https://deep-fence.com>"), "URL inside 4-backtick fence skipped");
}

// code block with language tag
{
	const input = "```bash\ncurl https://in-bash.com/api\n```\nhttps://outside.com\n";
	const result = processContent(input);
	assert(result.added === 1, "fenced block with lang → only outside URL");
}

// nested code fence (3 inside 4)
{
	const input = "````\n```\nhttps://nested.com\n```\n````\nhttps://real.com\n";
	const result = processContent(input);
	assert(result.added === 1, "nested fence → only outside URL");
	assert(!result.content.includes("- <https://nested.com>"), "nested fence URL skipped");
}

// ============================================================
// processContent — inline code skipping
// ============================================================
section("processContent — inline code skipping");

{
	const input = "run `curl https://in-inline.com` to test\nhttps://outside.com\n";
	const result = processContent(input);
	assert(result.added === 1, "inline code URL skipped");
	assert(!result.content.includes("- <https://in-inline.com>"), "inline code URL not in output");
	assert(result.content.includes("- <https://outside.com>"), "outside URL added");
}

// ============================================================
// processContent — ## reference inside code block (vault pattern)
// ============================================================
section("processContent — ## reference inside code block");

{
	const input = [
		"# wireshark",
		"",
		"```markdown",
		"## reference",
		"",
		"okay, i want to learn about wireshark.",
		"```",
		"",
		"https://real-link.com",
		"",
		"## reference",
		"",
	].join("\n");
	const result = processContent(input);
	assert(result !== null, "ref heading in code block ignored, real one found");
	assert(result.added === 1, "adds link to real ## reference");
	assert(result.content.includes("- <https://real-link.com>"), "correct URL added");
}

{
	const input = [
		"# demo",
		"",
		"https://outside.com",
		"",
		"```markdown",
		"this fence is intentionally unclosed",
		"## reference",
	].join("\n");

	const result = processContent(input);
	assert(result !== null, "fallback heading scan handles desynced code fence state");
	assert(result.added === 1, "only valid outside URL added with fallback");
	assert(result.content.includes("- <https://outside.com>"), "outside URL appended");
}

// ============================================================
// processContent — wikilinks ignored
// ============================================================
section("processContent — wikilinks ignored");

{
	const input = "see [[snapshot|TIL]] and [[docker]] for more\n";
	const result = processContent(input);
	assert(result === null, "wikilinks produce no URLs → null");
}

// ============================================================
// processContent — mixed real-world vault content
// ============================================================
section("processContent — real-world vault patterns");

// kubernetes.md style: numbered list with [ref](URL) and bare <URL>
{
	const input = [
		"# kubernetes",
		"",
		"## unanswered",
		"",
		"1. but where should you implement image scanning? [ref](https://sysdig.com/blog/image-scanning-admission-controller/). (policies are hard)",
		"1. why read-only volume mounts are not read-only until v1.30; [link](https://kubernetes.io/blog/2024/04/23/recursive-read-only-mounts/)",
		"2. why do you need last applied configuration <https://chatgpt.com/c/68b97f76-ef68-8332-9a11-b3bc1699ea87>",
		"",
		"## reference",
		"",
	].join("\n");
	const result = processContent(input);
	assert(result !== null, "k8s-style content → not null");
	assert(result.added === 3, "k8s-style → 3 URLs extracted");
	assert(result.content.includes("- <https://sysdig.com/blog/image-scanning-admission-controller/>"), "sysdig URL");
	assert(result.content.includes("- <https://kubernetes.io/blog/2024/04/23/recursive-read-only-mounts/>"), "k8s blog URL");
	assert(result.content.includes("- <https://chatgpt.com/c/68b97f76-ef68-8332-9a11-b3bc1699ea87>"), "chatgpt URL");
}

// docker.md style: numbered list with [ref](URL) and [link](URL)
{
	const input = [
		"# docker",
		"",
		"1. use exec $@ for shell scripts [link](https://unix.stackexchange.com/questions/466999/what-does-exec-do)",
		"19. toll of compression [ref](https://labs.iximiuz.com/challenges/build-and-push-uncompressed-container-image)- the problem",
		"",
		"## bytes",
		"",
		"- CoW is heavily underrated.",
		"",
		"## reference",
		"",
	].join("\n");
	const result = processContent(input);
	assert(result !== null, "docker-style → not null");
	assert(result.added === 2, "docker-style → 2 URLs");
}

// snapshot.md style: heading followed by bare URL bullets
{
	const input = [
		"## nvidia GPU power capping",
		"",
		"Oct 08, 2024",
		"",
		"- <https://www.ibm.com/docs/en/essl/6.3?topic=subroutine-nvidia-gpu-power-capping>",
		"",
		"some content here about GPU throttling.",
		"",
		"## reference",
		"",
	].join("\n");
	const result = processContent(input);
	assert(result !== null, "snapshot-style → not null");
	assert(result.added === 1, "snapshot-style bullet URL extracted");
}

// ============================================================
// processContent — idempotency
// ============================================================
section("processContent — idempotency");

{
	const input = "https://example.com inline\n\n## reference\n\n";
	const first = processContent(input);
	assert(first !== null, "first pass → adds URL");
	const second = processContent(first.content);
	assert(second === null, "second pass → nothing to add (idempotent)");
}

// run 3 times
{
	let content = "link1 https://a.com and [link2](https://b.com)\n";
	const r1 = processContent(content);
	assert(r1.added === 2, "idempotent pass 1 → 2 added");
	content = r1.content;
	const r2 = processContent(content);
	assert(r2 === null, "idempotent pass 2 → null");
}

// ============================================================
// processContent — edge cases
// ============================================================
section("processContent — edge cases");

// empty file
assert(processContent("") === null, "empty file → null");

// file with only ## reference
assert(processContent("## reference\n") === null, "only ## reference → null");

// URL on the ## reference heading line itself (shouldn't happen but test)
{
	const input = "https://body.com\n\n## reference\n";
	const result = processContent(input);
	assert(result !== null, "URL in body with empty ref → not null");
	assert(result.added === 1, "URL in body added");
}

// multiple ## reference sections — last one wins
{
	const input = [
		"## reference",
		"",
		"- <https://first-section.com>",
		"",
		"## other stuff",
		"",
		"https://body.com",
		"",
		"## reference",
		"",
		"- <https://second-section.com>",
		"",
	].join("\n");
	const result = processContent(input);
	// body.com is between first ref section end and second ref section start
	// the plugin takes the last ## reference, so body.com is before it
	assert(result !== null, "multiple ref sections → not null");
	assert(result.content.includes("- <https://body.com>"), "body URL extracted");
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
	console.log(`\nFailures:`);
	failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log("═".repeat(40));
process.exit(failed > 0 ? 1 : 0);
