import fs from "fs";
import http from "http";
import path from "path";

const docsDir = path.resolve(process.cwd(), "docs");
const port = Number(process.env.PORT || 8080);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolveRequestPath(url = "/") {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const requestedPath = path.resolve(docsDir, relativePath);

  if (!requestedPath.startsWith(docsDir + path.sep) && requestedPath !== docsDir) {
    return null;
  }

  return requestedPath;
}

http.createServer((req, res) => {
  const requestedPath = resolveRequestPath(req.url);
  if (!requestedPath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(requestedPath, (statError, stats) => {
    const filePath = !statError && stats.isDirectory() ? path.join(requestedPath, "index.html") : requestedPath;

    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const contentType = contentTypes[path.extname(filePath)] || "application/octet-stream";
      res.writeHead(200, {"content-type": contentType});
      res.end(data);
    });
  });
}).listen(port, () => {
  console.log(`Serving API docs from ${docsDir} at http://127.0.0.1:${port}`);
});
