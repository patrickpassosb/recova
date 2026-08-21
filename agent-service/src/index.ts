import { createApp } from "./http/server.js";

const port = Number(process.env.PORT ?? 8080);
const server = createApp();

server.listen(port, () => {
  console.log(`agent-service listening on :${port}`);
});
