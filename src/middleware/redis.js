const { createClient } = require("redis");
const hash = require("object-hash");
const zlib = require("zlib");
let redisClient = undefined;

async function initializeRedisClient() {
  console.log("call redis");
  let redisUrl = process.env.REDIS_URI;
  if (redisUrl) {
    redisClient = createClient({ url: redisUrl }).on("error", (e) => {
      console.error(`Failed to create the Redis client with error:`);
      console.error(e);
    });

    try {
      await redisClient.connect();
      console.log(`Connected to Redis successfully!`);
    } catch (error) {
      console.error(`Connection to Redis failed with error:`);
      console.error(e);
    }
  }
}

function requestToKey(req) {
  const reqDataToHash = {
    query: req.query,
    body: req.body,
  };

  return `${req.path}@${hash.sha1(reqDataToHash)}`;
}

function isRedisWorking() {
  return !!redisClient?.isOpen;
}

async function writeData(key, data, options, compress) {
  if (isRedisWorking()) {
    let dataToCache = data;
    if (compress) {
      dataToCache = zlib.deflateSync(data).toString("base64");
    }
    try {
      await redisClient.set(key, dataToCache, options);
    } catch (error) {
      console.log(`Failed to cache data for key=${key}`, error);
    }
  }
}

async function readData(key, compress) {
  let cacheValue = undefined;

  if (isRedisWorking()) {
    cacheValue = await redisClient.get(key);
    if (cacheValue) {
      if (compress) {
        return zlib.inflateSync(Buffer.from(cacheValue, "base64")).toString();
      } else {
        return cacheValue;
      }
    }
  }
  return cacheValue;
}

function redisCacheMiddleware(
  options = {
    EX: 21600, // 6h
  },
  compression = true
) {
  return async (req, res, next) => {
    if (isRedisWorking()) {
      const key = requestToKey(req);
      // if there is some cached data, retrieve it and return it
      const cachedValue = await readData(key, compression);
      if (cachedValue) {
        try {
          // if it is a json data, then return it
          return res.json(JSON.parse(cachedValue));
        } catch (error) {
          // if it is not a json data, then return it
          return res.send(cachedValue);
        }
      } else {
        // override how res.send behaves
        const oldSend = res.send;
        res.send = function (data) {
          res.send = oldSend;

          if (res.statusCode.toString().startsWith("2")) {
            writeData(key, data, options, compression).then();
          }

          return res.send(data);
        };

        next();
      }
    } else {
      next();
    }
  };
}

module.exports = { initializeRedisClient, redisCacheMiddleware };
