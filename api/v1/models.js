const { forward } = require("../_proxy");

module.exports = forward("/v1/models", "application/json");
