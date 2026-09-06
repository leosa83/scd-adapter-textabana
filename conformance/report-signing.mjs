import { createPublicKey, sign, verify } from "node:crypto";
import { canonicalize, canonicalDigest } from "../runtime/canonical-json.js";

export async function signReport(report, privateKey) {
  if (report.schema !== "textabana.external-report/v1") throw new Error("Unsupported report schema.");
  const publicKey = createPublicKey(privateKey);
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Report signing requires Ed25519.");
  return { schema: "textabana.signed-report/v1", algorithm: "Ed25519", report, reportDigest: await canonicalDigest(report), signature: sign(null, Buffer.from(canonicalize(report)), privateKey).toString("base64") };
}

export async function verifyReport(envelope, trustedPublicKey) {
  // Trust is supplied by the verifier. Never trust a key embedded in an artifact.
  const key = createPublicKey(trustedPublicKey);
  if (key.asymmetricKeyType !== "ed25519" || envelope.schema !== "textabana.signed-report/v1" || envelope.algorithm !== "Ed25519" || envelope.report?.schema !== "textabana.external-report/v1") throw new Error("Unsupported signed report.");
  if (await canonicalDigest(envelope.report) !== envelope.reportDigest || !verify(null, Buffer.from(canonicalize(envelope.report)), key, Buffer.from(envelope.signature, "base64"))) throw new Error("Report signature or digest mismatch.");
  return { authentic: true, reportStatus: envelope.report.status, claim: envelope.report.claim, reportDigest: envelope.reportDigest };
}
