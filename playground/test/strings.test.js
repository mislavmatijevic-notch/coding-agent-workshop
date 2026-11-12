const { test } = require("node:test");
const assert = require("node:assert");
const { capitalize, reverse } = require("../src/strings");

test("capitalize uppercases the first letter", () => {
  assert.strictEqual(capitalize("bok"), "Bok");
});

test("capitalize returns an empty string for an empty string", () => {
  assert.strictEqual(capitalize(""), "");
});

test("capitalize uppercases a single letter", () => {
  assert.strictEqual(capitalize("b"), "B");
});

test("capitalize keeps an already uppercase first letter", () => {
  assert.strictEqual(capitalize("Bok"), "Bok");
});

test("capitalize works with non-ASCII first letters", () => {
  assert.strictEqual(capitalize("ćao"), "Ćao");
  assert.strictEqual(capitalize("šuma"), "Šuma");
});

test("capitalize throws TypeError for null", () => {
  assert.throws(() => capitalize(null), TypeError);
});

test("reverse reverses a string", () => {
  assert.strictEqual(reverse("abc"), "cba");
});

test("reverse returns an empty string for an empty string", () => {
  assert.strictEqual(reverse(""), "");
});

test("reverse throws TypeError for a non-string", () => {
  assert.throws(() => reverse(123), TypeError);
});
