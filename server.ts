const root = import.meta.dir;

const server = Bun.serve({
  port: Number(Bun.env.PORT || 3000),
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = `${root}${pathname}`;

    if (!filePath.startsWith(root)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file);
  },
});

console.log(`ACD Homecoming is running at http://localhost:${server.port}`);
