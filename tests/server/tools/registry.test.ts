import assert from "node:assert/strict";
import test from "node:test";
import { executeRegisteredTool } from "../../../src/server/tools/registry";

test("word count handles repeated whitespace and empty input", () => {
  assert.deepEqual(executeRegisteredTool("text.word_count", { text: "alpha  beta\ngamma\tdelta" }), { wordCount: 4 });
  assert.deepEqual(executeRegisteredTool("text.word_count", { text: "  \n\t " }), { wordCount: 0 });
});

test("keyword extraction counts meaningful repeated words", () => {
  const result = executeRegisteredTool("text.extract_keywords", {
    text: "renewable energy solar power solar panels wind power",
  }) as { keywords: Array<{ keyword: string; count: number }> };
  assert.equal(result.keywords.find((item) => item.keyword === "solar")?.count, 2);
  assert.equal(result.keywords.find((item) => item.keyword === "power")?.count, 2);
  assert.equal(result.keywords.some((item) => item.keyword === "and"), false);
});

test("text statistics report exact character, whitespace, word and sentence counts", () => {
  const source = "Futuristic System builds reliable AI agents. Agents use approved tools!";
  assert.deepEqual(executeRegisteredTool("text.text_stats", { text: source }), {
    characters: source.length,
    charactersWithoutWhitespace: source.replace(/\s/gu, "").length,
    words: 10,
    sentences: 2,
  });
});

test("text tools reject unexpected arguments and oversized text", () => {
  assert.throws(() => executeRegisteredTool("text.word_count", { text: "hello", extra: true }));
  assert.throws(() => executeRegisteredTool("text.text_stats", { text: "x".repeat(12001) }));
});
