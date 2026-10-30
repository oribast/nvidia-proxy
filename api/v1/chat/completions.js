const { forward } = require("../../_proxy");

module.exports = forward("/v1/chat/completions", "text/event-stream");
