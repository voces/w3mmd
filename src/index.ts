/// <reference path="./deploy.d.ts" />

addEventListener("fetch", (event) => {
  const response = new Response("Hello World! " + Math.random(), {
    headers: { "content-type": "text/plain" },
  });
  event.respondWith(response);
});
