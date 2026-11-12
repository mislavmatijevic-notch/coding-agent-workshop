function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function reverse(str) {
  if (typeof str !== "string") {
    throw new TypeError("reverse expects a string");
  }
  return [...str].reverse().join("");
}

module.exports = { capitalize, reverse };
