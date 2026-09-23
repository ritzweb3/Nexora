const { customAlphabet } = require("nanoid");
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const gen = customAlphabet(alphabet, 12);

function id(prefix) {
  return `${prefix}_${gen()}`;
}

module.exports = { id };
