const { test } = require("node:test");
const assert = require("node:assert");
const { add, subtract, multiply } = require("../src/math");

test("add adds two numbers", () => {
  assert.strictEqual(add(2, 3), 5);
});

test("subtract subtracts two numbers", () => {
  assert.strictEqual(subtract(5, 3), 2);
});

test("multiply multiplies two numbers", () => {
  assert.strictEqual(multiply(2, 3), 6);
});

test("multiply by zero returns zero", () => {
  assert.strictEqual(multiply(5, 0), 0);
});

test("multiply with negative numbers", () => {
  assert.strictEqual(multiply(-2, 3), -6);
  assert.strictEqual(multiply(-2, -3), 6);
});
