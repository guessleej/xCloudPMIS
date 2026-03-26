// Redis cache service stub
let _client = null;
function getRedis() { return _client; }
function setRedisClient(client) { _client = client; }
module.exports = { getRedis, setRedisClient };
