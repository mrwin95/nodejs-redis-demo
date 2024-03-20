const express = require("express");
require("dotenv").config();
const { UserController } = require("./src/controllers/users");
const {
  initializeRedisClient,
  redisCacheMiddleware,
} = require("./src/middleware/redis");

async function initializeExpressServer() {
  const app = express();
  app.use(express.json());

  // connect redis
  await initializeRedisClient();

  app.get(
    "/api/v1/users",
    redisCacheMiddleware(
      {
        options: {
          EX: 43200, // 12h
          NX: false, // write the data even if the key already exists
        },
      },
      (compression = true)
    ),
    UserController.getAll
  );

  const port = 3001;
  app.listen(port, () => {
    console.log("Start port 3001");
  });
}

initializeExpressServer()
  .then()
  .catch((e) => console.error(e));
