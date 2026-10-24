// Test helper. Sign JWTs with a fresh RSA key so the suite needs no Entra.
// stdin: {"tokens": [{"claims": {...}, "header"?: {...}, "foreign_key"?: true}]}
// stdout: {"jwks": {"keys": [...]}, "tokens": ["..."]}
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const request = JSON.parse(readFileSync(0, "utf-8"));
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const foreign = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: "jwk" }), kid: "test-key", use: "sig", alg: "RS256" };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

const tokens = request.tokens.map(({ claims, header, foreign_key }) => {
  const head = b64({ alg: "RS256", typ: "JWT", kid: "test-key", ...header });
  const body = b64(claims);
  const signer = foreign_key ? foreign.privateKey : key.privateKey;
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), signer).toString("base64url");
  return `${head}.${body}.${signature}`;
});
process.stdout.write(JSON.stringify({ jwks: { keys: [jwk] }, tokens }));
