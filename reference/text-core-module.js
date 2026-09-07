// Trusted adapter for textabana.text-core/v1. Never supplied by profile inputs.
const bounded = (value) => {
  if (new TextEncoder().encode(value).length > 262144) {
    const error = new Error("text-core render limit"); error.code = "TBA-TEXT-CORE-LIMIT"; throw error;
  }
  return value;
};
const pure = (transform) => ({ state: "pure", determinism: "deterministic", effects: [], transform });
define({
  identity: pure((input) => bounded(input)),
  asciiUpper: pure((input) => bounded(input.replace(/[a-z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 32)))),
  wrap: pure((input, args) => bounded((args.prefix ?? "") + input + (args.suffix ?? ""))),
  replaceLiteral: pure((input, args) => {
    if (!args.old) throw new Error("old must be nonempty");
    let count = 0, at = 0;
    while ((at = input.indexOf(args.old, at)) !== -1) { count++; at += args.old.length; }
    const bytes = (value) => new TextEncoder().encode(value).length;
    if (bytes(input) + count * (bytes(args.new ?? "") - bytes(args.old)) > 262144) {
      const error = new Error("text-core render limit"); error.code = "TBA-TEXT-CORE-LIMIT"; throw error;
    }
    return bounded(input.split(args.old).join(args.new ?? ""));
  }),
  fail: pure(() => { throw new Error("text-core intentional failure"); }),
});
