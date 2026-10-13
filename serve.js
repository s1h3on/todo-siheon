// 내 컴퓨터 안에서만 도는 작은 서버. 열기.cmd가 실행해요.
// YouTube는 더블클릭으로 연 페이지(file://)에서는 재생을 막아서, http://localhost 로 열어 줘요.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = 8123;
const ROOT = __dirname;
const ADDRESS = `http://localhost:${PORT}/`;

// 보여 줘도 되는 파일 종류만 내보내요 (.env.local, .git 같은 건 절대 안 내보내요)
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function openBrowser() {
  // 시험할 때는 NO_BROWSER=1 로 브라우저를 안 열 수 있어요
  if (process.env.NO_BROWSER) return;
  const command = process.platform === "win32" ? `start "" "${ADDRESS}"` : process.platform === "darwin" ? `open "${ADDRESS}"` : `xdg-open "${ADDRESS}"`;
  exec(command);
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("없는 파일이에요");
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, ADDRESS).pathname);
  } catch {
    notFound(res);
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.join(ROOT, relative);
  const type = TYPES[path.extname(file).toLowerCase()];

  // 폴더 밖, 점(.)으로 시작하는 파일·폴더, 모르는 종류는 막아요
  const hidden = relative.split(/[\\/]/).some((part) => part.startsWith("."));
  if (!file.startsWith(ROOT + path.sep) || hidden || !type) {
    notFound(res);
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      notFound(res);
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log("이미 켜져 있어요. 브라우저만 다시 열게요.");
    openBrowser();
    setTimeout(() => process.exit(0), 1500);
  } else {
    console.error("서버를 켜지 못했어요:", error.message);
    process.exit(1);
  }
});

// 127.0.0.1에서만 들어요: 같은 와이파이의 다른 컴퓨터는 들어올 수 없어요
server.listen(PORT, "127.0.0.1", () => {
  console.log(`할 일 목록이 ${ADDRESS} 에서 열렸어요.`);
  console.log("이 창을 닫으면 서버가 꺼져요.");
  openBrowser();
});
