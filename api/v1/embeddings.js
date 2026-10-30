const { forward } = require("../_proxy");

module.exports = forward("/v1/embeddings", "application/json");
