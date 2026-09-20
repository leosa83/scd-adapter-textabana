"""Independent lab package admission; never evaluates or imports module source."""
import hashlib
import json
import re
import sys

PROFILE = "textabana.module-admission/lab-v1"
# ECMAScript WhiteSpace + LineTerminator; Python str.strip() has a different set.
BLANK = "\u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff\u000a\u000d\u2028\u2029"


class PackageError(Exception):
    pass


def reject(kind):
    raise PackageError("TBA-MODULE-" + kind + "-LAB")


def nonblank(value):
    return isinstance(value, str) and bool(value.strip(BLANK))


def string_list(value):
    return isinstance(value, list) and all(nonblank(item) for item in value)


def path_identity(value):
    if re.match(r"^(https?:|data:|blob:)", value):
        return value
    parts = []
    for part in value.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
        else:
            parts.append(part)
    return "/".join(parts)


def grant_string(value):
    if isinstance(value, str):
        return value
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if type(value) in (int, float) and abs(value) <= 9007199254740991 and value == int(value):
        return str(int(value))
    raise ValueError("Grant value outside the module-admission profile")


def validate_input(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("modules"), list) or not isinstance(payload.get("options"), dict):
        raise ValueError("Profile requires modules array and options object")
    for package in payload["modules"]:
        if not isinstance(package, dict) or not all(isinstance(package.get(key), str) for key in ("path", "content")):
            raise ValueError("Profile requires string transport paths and source")
        package["path"].encode("utf-8")
        package["content"].encode("utf-8")
    grants = payload["options"].get("capabilityGrants")
    if isinstance(grants, list):
        for grant in grants:
            grant_string(grant)
    def signal(value):
        return not (value is None or value is False or value == "" or (type(value) in (int, float) and value == 0))
    if not signal(payload["options"].get("moduleLock")) and not any(signal(package.get("manifest")) or signal(package.get("digest")) for package in payload["modules"]):
        raise ValueError("Legacy unsecured packages are outside this profile")


def check_packages(payload):
    validate_input(payload)
    options = payload["options"]
    lock = options.get("moduleLock")
    if not isinstance(lock, dict) or lock.get("schema") != "textabana.module-lock/lab-v1" or not isinstance(lock.get("packages"), list):
        reject("LOCK")
    locked = {}
    for entry in lock["packages"]:
        if not isinstance(entry, dict) or not all(nonblank(entry.get(key)) for key in ("namespace", "version", "entrypoint", "digest")):
            reject("LOCK")
        identity = entry["namespace"] + "@" + entry["version"]
        if identity in locked:
            reject("LOCK")
        locked[identity] = entry
    values = options.get("capabilityGrants")
    grants = {grant_string(value) for value in values} if isinstance(values, list) else set()
    seen = set()
    for package in payload["modules"]:
        manifest = package.get("manifest")
        if not isinstance(manifest, dict) or manifest.get("schema") != "textabana.module-manifest/lab-v1":
            reject("MANIFEST")
        namespace, version = manifest.get("namespace"), manifest.get("version")
        if not isinstance(namespace, str) or not isinstance(version, str) or not re.fullmatch(r"[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+", namespace) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?", version):
            reject("IDENTITY")
        identity = namespace + "@" + version
        if identity in seen:
            reject("DUPLICATE")
        seen.add(identity)
        entrypoint = manifest.get("entrypoint")
        if not nonblank(entrypoint) or path_identity(entrypoint) != path_identity(package["path"]):
            reject("ENTRYPOINT")
        digest = "sha256:" + hashlib.sha256(package["content"].encode("utf-8")).hexdigest()
        if package.get("digest") != digest or manifest.get("digest") != digest:
            reject("DIGEST")
        entry = locked.get(identity)
        if entry is None or entry["digest"] != digest or path_identity(entry["entrypoint"]) != path_identity(package["path"]):
            reject("LOCK")
        capabilities = manifest.get("capabilities")
        if not isinstance(capabilities, dict) or not all(string_list(capabilities.get(key)) for key in ("required", "channels", "resources")):
            reject("CAPABILITIES")
        required = capabilities["required"] + ["channel:" + name for name in capabilities["channels"]] + ["resource:" + name for name in capabilities["resources"]]
        if any(name not in grants for name in required):
            reject("GRANT")
        functions = manifest.get("functions")
        if not isinstance(functions, list):
            reject("FUNCTION-CONTRACT")
        names = set()
        for function in functions:
            if not isinstance(function, dict) or not nonblank(function.get("name")) or function.get("state") not in ("pure", "run", "session") or function.get("determinism") not in ("deterministic", "nondeterministic") or not string_list(function.get("effects")):
                reject("FUNCTION-CONTRACT")
            if function["name"] in names:
                reject("FUNCTION-CONTRACT")
            names.add(function["name"])
    if len(locked) != len(seen):
        reject("LOCK")


def admit(payload):
    try:
        check_packages(payload)
        return {"admitted": True, "error": None}
    except PackageError as error:
        return {"admitted": False, "error": str(error)}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def invalid_constant(value):
    raise ValueError("Invalid JSON constant: " + value)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "batch"
    if mode == "run" and len(sys.argv) == 3:
        with open(sys.argv[2], encoding="utf-8") as file:
            payload = json.load(file, object_pairs_hook=unique_object, parse_constant=invalid_constant)
        result = admit(payload)
        print(json.dumps({"profile": PROFILE, "result": result}, ensure_ascii=False))
        return 0 if result["admitted"] else 1
    if mode != "batch":
        raise ValueError("Usage: module_admission.py batch | run input.json")
    payload = json.load(sys.stdin, object_pairs_hook=unique_object, parse_constant=invalid_constant)
    results = [admit(value) for value in payload["inputs"]]
    print(json.dumps({"profile": PROFILE, "results": results}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, TypeError, KeyError, UnicodeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
