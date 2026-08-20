// src/lib/projects/route-links.ts
import type { GeneratedProjectFile } from "@/lib/projects/generated-types";

export function ensureRegisteredRouteLinks(
  files: GeneratedProjectFile[],
): GeneratedProjectFile[] {
  const router = files.find((file) => file.path === "src/router.tsx")?.content;
  if (!router) {
    return files;
  }
  const registered = new Set<string>(["/"]);
  const pathRe = /path:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(router)) !== null) {
    const p = m[1];
    if (p === "*") {
      continue;
    }
    registered.add(p.startsWith("/") ? p : `/${p}`);
  }

  return files.map((file) => {
    if (!file.path.endsWith(".tsx")) {
      return file;
    }
    // Match <Link to="/produk" ...> or <Link ... to="/produk" ...>
    const content = file.content.replace(
      /<Link([^>]*?)\sto="(\/[^"/]+)"([^>]*?)>/g,
      (all, before: string, target: string, after: string) => {
        if (registered.has(target)) {
          return all;
        }
        const slug = target.slice(1);
        const hash = `hash="${slug}"`;
        return `<Link${before} to="/" ${hash}${after}>`;
      },
    );
    return content === file.content ? file : { ...file, content };
  });
}
