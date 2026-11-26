import assert from "node:assert/strict";
import { punctuationGroups, removeTrailingPunctuation } from "../js/editor/SubtitlePunctuation.js";

const defaults = new Set(punctuationGroups.filter(group => group.checked).map(group => group.id));
assert.deepEqual([...defaults], ["period", "comma", "question", "exclamation"]);
assert.equal(removeTrailingPunctuation("「行く？！」\r\n【好的，】\nHello, world!  ", defaults),
    "「行く」\r\n【好的】\nHello, world");

const english = "It's the students’\nThe teachers'\nFirst clause;\nWait...\nWait…\n`code`";
assert.equal(removeTrailingPunctuation(english, defaults), english);
assert.equal(removeTrailingPunctuation(english, new Set(["other"])),
    "It's the students’\nThe teachers'\nFirst clause\nWait\nWait\n`code`");

const mixed = "She said “go!”\n「はい。」\n（好！）";
assert.equal(removeTrailingPunctuation(mixed, new Set(["quote"])), "She said “go!\n「はい。\n（好！）");
assert.equal(removeTrailingPunctuation(mixed, new Set(["bracket"])), "She said “go!”\n「はい。」\n（好！");
assert.equal(removeTrailingPunctuation(mixed, new Set()), mixed);
assert.equal(removeTrailingPunctuation("句末！\u2028下一行？\u2029  ", defaults), "句末\u2028下一行\u2029  ");
console.log("Subtitle punctuation groups, English endings and multiline cleanup passed");
