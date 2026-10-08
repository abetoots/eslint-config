// a JavaScript file. no-undef is on for it and only the language's own globals are known,
// so `console` and `process` are reported until the consumer names an environment.
console.log(process.argv);
// no-eval is in oxlint's `correctness` category and not in the preset: it must be
// reported only when a consumer switches that category on
eval("1");
