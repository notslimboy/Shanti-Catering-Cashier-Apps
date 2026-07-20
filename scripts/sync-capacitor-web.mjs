import { access, cp, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const webDir = join(root, "www");
const staticFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "service-worker.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon.svg",
  "logocatering.webp",
];
const staticDirectories = ["assets", "vendor"];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyFileIfPresent(relativePath) {
  const source = join(root, relativePath);
  if (!(await exists(source))) return;
  const destination = join(webDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function copyDirectoryIfPresent(relativePath) {
  const source = join(root, relativePath);
  if (!(await exists(source))) return;
  const destination = join(webDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const file of staticFiles) await copyFileIfPresent(file);
for (const directory of staticDirectories) await copyDirectoryIfPresent(directory);

console.log("Capacitor web bundle prepared in www/");
