// A second origin (127.0.0.1:8179): media WITHOUT Cross-Origin-Resource-Policy,
// one variant with CORS (ACAO *) and one without, and a popup page that talks
// back to its opener (the Google / Apple sign-in popup pattern).
import http from "node:http";
import { readFile } from "node:fs/promises";
const DIR = process.env.DIR;
http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const cors = u.searchParams.has("cors");
    const corp = u.searchParams.has("corp");
    const h = {};
    if (cors) h["access-control-allow-origin"] = "*";
    if (corp) h["cross-origin-resource-policy"] = "cross-origin";
    if (u.pathname === "/popup.html") {
      res.writeHead(200, { "content-type": "text/html" }).end(`<script>
      var ok = !!window.opener; try { window.opener.postMessage({signedIn: true}, '*'); } catch (e) {}
      document.title = 'popup opener=' + ok; setTimeout(function(){ window.close(); }, 300);
    </script>`);
      return;
    }
    const map = {
      "/img.png": ["img.png", "image/png"],
      "/clip.mp4": ["clip.mp4", "video/mp4"],
      "/clip.webm": ["clip.webm", "video/webm"],
      "/voice.wav": ["voice.wav", "audio/wav"],
    };
    const m = map[u.pathname];
    if (!m) {
      res.writeHead(404).end();
      return;
    }
    const body = await readFile(DIR + "/" + m[0]);
    res
      .writeHead(200, { ...h, "content-type": m[1], "accept-ranges": "bytes" })
      .end(body);
  })
  .listen(8179, "127.0.0.1", () => console.log("other origin on 8179"));
