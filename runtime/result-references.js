

function operationalReferenceMap({ runInstanceId = null, channelSnapshots = {}, sourceMaps = [], activities = [] }) {
  const replacements = new Map();
  if (runInstanceId) replacements.set(runInstanceId, "run-instance:$semantic");
  activities.forEach((activity, index) => {
    const semanticRef = activity.planNodeRef || activity.orderKey || `${activity.function || "stage"}:${index + 1}`;
    if (activity.runRef) replacements.set(activity.runRef, "run-instance:$semantic");
    if (activity.stageId) replacements.set(activity.stageId, `stage:${semanticRef}`);
    if (activity.invocationId) replacements.set(activity.invocationId, `invocation:${semanticRef}`);
    if (activity.activityId) replacements.set(activity.activityId, `activity:${semanticRef}`);
  });
  for (const event of Object.values(channelSnapshots).flatMap((snapshot) => snapshot.events || [])) {
    const semanticEventId = `event:${event.documentVersion}:${String(event.sequence).padStart(4, "0")}`;
    if (event.runRef) replacements.set(event.runRef, "run-instance:$semantic");
    if (event.eventId) replacements.set(event.eventId, semanticEventId);
    if (event.id) replacements.set(event.id, semanticEventId);
  }
  for (const mapping of sourceMaps || []) {
    const semanticOutputRef = replacements.get(mapping.outputRef) || mapping.outputRef;
    if (mapping.mappingId) replacements.set(mapping.mappingId, `mapping:${semanticOutputRef}`);
  }
  return replacements;
}

function normalizeOperationalReferences(value, replacements) {
  if (typeof value === "string") return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => normalizeOperationalReferences(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeOperationalReferences(item, replacements)]));
  }
  return value;
}

export { normalizeOperationalReferences, operationalReferenceMap };

