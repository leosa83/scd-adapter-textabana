import { canonicalize, canonicalDigest } from "./canonical-json.js";
import { identityError, SEMANTIC_CONTRACT, validateSemanticStructure, validateSemanticReferences } from "./semantic-contract.js";

const SEMANTIC_PROFILE = "textabana.semantic-artifacts/v1";

export async function verifyDetachedSemanticBundle(bundle) {
  if (bundle && Object.hasOwn(bundle, "claims") && canonicalize(bundle.claims) !== canonicalize({ artifactIdentity: "computed", profileConformance: "not-evaluated", fullRuntimeConformance: false })) identityError("Integrity verification cannot promote conformance claims.", "claims");
  validateSemanticStructure(bundle);
  for (const kind of ["source", "context", "ir", "plan", "result"]) {
    const item = bundle[kind];
    if (!item) continue;
    if (await canonicalDigest(item.artifact) !== item.id) identityError(`Invalid ${kind} digest.`, "digest");
  }
  if (bundle.context.artifact.sourceId !== bundle.source.id || (bundle.ir && bundle.ir.artifact.sourceId !== bundle.source.id)
    || (bundle.plan && (!bundle.ir || bundle.plan.artifact.irId !== bundle.ir.id || bundle.plan.artifact.contextId !== bundle.context.id))
    || (bundle.result && (!bundle.plan || bundle.result.artifact.planId !== bundle.plan.id || bundle.result.artifact.irId !== bundle.ir.id || bundle.result.artifact.contextId !== bundle.context.id || bundle.result.artifact.sourceId !== bundle.source.id))) identityError("Broken semantic identity chain.", "chain");
  await validateSemanticReferences(bundle);
  return { schema: "textabana.semantic-verification/v1", integrity: "verified", profile: SEMANTIC_PROFILE,
    identities: Object.fromEntries(["source", "context", "ir", "plan", "result"].map((key) => [key, bundle[key]?.id ?? null])),
    contract: SEMANTIC_CONTRACT, structure: "valid", references: "verified", bundleDigest: await canonicalDigest(bundle),
    profileConformance: "not-evaluated", fullRuntimeConformance: false };
}
