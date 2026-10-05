// Generates the Ventura licence signing key pair (Ed25519).
//   npm run license:keygen
// - The PRIVATE key is written to this backend's .env as LICENSE_PRIVATE_KEY
//   (base64 of the PKCS#8 PEM). It is never printed. Keep it out of git and
//   back it up: if it's lost, every client needs a new Ventura backend build.
// - The PUBLIC key is printed; it is built into the Ventura backend
//   (src/licensing/publicKey.ts).
// Refuses to run if .env already has a key, so a working key isn't replaced
// by accident (replacing it invalidates every licence already issued).
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (/^\s*LICENSE_PRIVATE_KEY\s*=\s*\S/m.test(envContent)) {
  console.error("LICENSE_PRIVATE_KEY is already set in .env - not replacing it.");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

appendFileSync(
  envPath,
  `${envContent.endsWith("\n") || !envContent ? "" : "\n"}\n# Ventura licence signing key (Ed25519). Never commit or share.\nLICENSE_PRIVATE_KEY=${Buffer.from(privatePem).toString("base64")}\n`
);

console.log("Private key written to .env as LICENSE_PRIVATE_KEY.");
console.log("Public key (put this in the Ventura backend, src/licensing/publicKey.ts):\n");
console.log(publicPem);
