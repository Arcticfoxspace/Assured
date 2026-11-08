// U1: Hinglish / Devanagari danger detection in V1. Phrase list still needs native-speaker review.
import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/lib/mewvi/intents";
import { agentGate } from "../src/lib/mewvi/agent/planner";
import { normalize } from "../src/lib/mewvi/text";

const danger = [
  "bachao mujhe koi maar raha hai",
  "BACHAO!!",
  "mujhe bachao",
  "bacha lo please",
  "meri madad karo",
  "wo mujhe maar dega",
  "mujhe maar rahe hain",
  "koi mere peeche pad gaya hai",
  "uske paas chaku hai",
  "mujhe kidnap kar rahe hain",
  "unhone mujhe pakad liya",
  "बचाओ",
  "मुझे बचाओ",
  "कोई मुझे मार रहा है",
  "मेरी मदद करो",
];
const selfHarm = [
  "main marna chahta hu",
  "main marna chahti hoon",
  "mujhe jeena nahi chahta",
  "jeene ka mann nahi hai",
  "mujhe khudkushi ka mann hai",
  "aatmahatya karna chahta hu",
  "मैं मरना चाहता हूँ",
  "आत्महत्या",
];
const safe = [
  "bazaar kahan hai",
  "mujhe market jana hai",
  "how do I report a scam",
  "mujhe report karna hai",
  "hello",
  "what is the women helpline number",
  "मुझे हेल्पलाइन नंबर बताओ",
];

test("U1: Hinglish and Devanagari pleas reach the emergency flow", () => {
  for (const m of danger) {
    const c = classify(m, "home");
    assert.equal(c.intent, "emergency_danger", m);
    assert.equal(c.danger, "danger", m);
  }
});

test("U1: Hinglish and Devanagari self-harm reaches the mental-health flow", () => {
  for (const m of selfHarm) {
    const c = classify(m, "home");
    assert.equal(c.intent, "mental_health", m);
    assert.equal(c.danger, "self-harm", m);
  }
});

test("U1: ordinary Hindi/Hinglish and English messages are not treated as danger", () => {
  for (const m of safe) assert.equal(classify(m, "home").danger, undefined, m);
});

test("U1: none of these ever reach a model", () => {
  for (const m of [...danger, ...selfHarm]) assert.equal(agentGate(normalize(m), classify(m, "home"), m).use, false, m);
});

// Session 4 probe: realistic phrasings that used to fall through to out_of_scope/greeting.
const moreDanger = ["koi mera peecha kar raha hai","mere peeche ek aadmi lag gaya hai","mujhe darr lag raha hai koi follow kar raha hai","meri jaan khatre mein hai","mujhe gher liya hai logon ne","uske paas gun hai","koi mujhe utha raha hai","rape ho raha hai","मेरे पीछे कोई पड़ा है","पति मुझे पीट रहा है","मुझे किडनैप कर लिया","पुलिस को बुलाओ","मदद चाहिए जल्दी","मुझे बचा ल\u094b"];
const moreSelfHarm = ["mujhe lagta hai main mar jaun","main khud ko khatam kar lunga","maine goliyan kha li hain","koi wajah nahi jeene ki","मैं खुद को खत्म कर लूंगी","मर जाऊं तो अच्छा","ज़िन्दगी से थक गई हूँ","ज\u093C\u093Fंदगी से थक गया","जान दे दूंगा"];
const stillSafe = ["mere dost ne mujhe bachaya kal","नमस्ते","मुझे कॉल करना है"];
test("U1b: extra Hinglish/Devanagari danger phrasings", () => {
  for (const m of moreDanger) assert.equal(classify(m, "home").intent, "emergency_danger", m);
});
test("U1b: extra self-harm phrasings", () => {
  for (const m of moreSelfHarm) assert.equal(classify(m, "home").intent, "mental_health", m);
});
test("U1b: past-tense 'bachaya' is not a plea; Devanagari non-greeting is not a greeting", () => {
  for (const m of stillSafe) assert.ok(!["emergency_danger", "mental_health"].includes(classify(m, "home").intent), m);
  assert.equal(classify("नमस्ते", "home").intent, "greeting");
  assert.notEqual(classify("मुझे कॉल करना है", "home").intent, "greeting");
});

// Session 5 (U1c): clear misses from the review-sheet probe. Phrase list still needs native review.
const u1cDanger = ["ghar mein chor ghus aaya hai", "police ko bulao", "madad chahiye jaldi", "accident ho gaya khoon beh raha hai", "mera dost behosh ho gaya hai", "uncle mujhe galat tarike se chhoo raha hai", "मेरे पीछे दो लड़के पड़े हैं"];
const u1cSelfHarm = ["ab aur nahi jee sakta", "jeene ka koi fayda nahi", "mar jaunga main haan", "मैं अपनी जान ले लूंगा", "अब जीने का कोई मतलब नहीं"];
const u1cStillSafe = ["police station kahan hai", "mujhe helpline number chahiye", "madad chahiye resume banane mein", "main thak gaya hu aaj kaam bahut tha", "exam mein mar gaya yaar", "मुझे हेल्पलाइन नंबर चाहिए"];
test("U1c: extra danger phrasings (chor, police bulao, khoon, behosh, chhoo)", () => {
  for (const m of u1cDanger) assert.equal(classify(m, "home").intent, "emergency_danger", m);
});
test("U1c: extra self-harm phrasings", () => {
  for (const m of u1cSelfHarm) assert.equal(classify(m, "home").intent, "mental_health", m);
});
test("U1c: nearby harmless messages stay out of the danger flows", () => {
  for (const m of u1cStillSafe) assert.equal(classify(m, "home").danger, undefined, m);
});

// U2 (session 6): wording found missing when the lists were reviewed line by line.
const u2Danger = [
  "usne mujhe dhakka diya",
  "pati mujh par haath uthata hai",
  "पति मुझे धक्का दे रहा है",
  "वो मुझ पर हाथ उठाता है",
];
const u2SelfHarm = [
  "ab main mar jaaunga",
  "main jaan de dungi",
  "jaan dene ka mann hai",
  "main phansi laga lunga",
  "main fansi le lunga",
  "pankhe se latak jaunga",
  "main chhat se kud jaunga",
  "main zeher kha lunga",
  "hath ki nas kaat lunga",
  "mar jana behtar hai",
  "train ke aage kud jaunga",
  "मैं फांसी लगा लूंगा",
  "मैं छत से कूद जाऊंगा",
  "ज़हर खा लूंगी",
  "मैं नस काट लूंगा",
  "मर जाना बेहतर है",
];
const u2Harmless = [
  "tere liye jaan de dunga",
  "help karo mujhe form bharna hai",
  "mujhe resume banane mein madad karo",
  "madad karo mujhe app samajhna hai",
  "bachao movie dekhi kal",
  "phansi ki saza kya hoti hai",
  "kal maine film mein phansi ka scene dekha",
  "zeher ke baare mein jaankari chahiye",
  "mujhe chhat par kapde sukhane hain",
  "gaadi ka number batao",
  "नदी पर पुल है",
  "मेरा फोन खो गया",
];
test("U2: violence wording (dhakka, haath uthana) is danger, in Hinglish and Devanagari", () => {
  for (const m of u2Danger) assert.equal(classify(m, "home").intent, "emergency_danger", m);
});
test("U2: self-harm methods and variant verb forms go to the support flow and never to a model", () => {
  for (const m of u2SelfHarm) {
    assert.equal(classify(m, "home").intent, "mental_health", m);
    assert.equal(agentGate(normalize(m), classify(m, "home"), m).use, false, m);
  }
});
test("U2: nearby harmless messages do not trigger the danger flows", () => {
  for (const m of u2Harmless) assert.equal(classify(m, "home").danger, undefined, m);
});
test("U2: a plea that mentions a number is still a plea (only film or task talk is excluded)", () => {
  for (const m of ["bachao police ka number do", "bachao mujhe koi maar raha hai, number batao"]) {
    assert.equal(classify(m, "home").intent, "emergency_danger", m);
  }
});
test("U2: Hinglish fear in a cab or auto reaches the unsafe-transport flow", () => {
  for (const m of ["auto wala galat raste le ja raha hai darr lag raha hai", "cab driver nahi ruk raha mujhe dar lag raha hai"]) {
    assert.equal(classify(m, "home").intent, "flow_unsafe_transport", m);
  }
});
test("U2: 'someone pushed and hit me' is danger; plain fear gets calm guidance, not the 112 screen and not a dead end", () => {
  assert.equal(classify("bhai ne dhakka diya aur maara", "home").intent, "emergency_danger");
  for (const m of ["mujhe darr lag raha hai", "mujhe darr lag raha hai akela hu", "mujhe asurakshit mehsoos ho raha hai"]) {
    const c = classify(m, "home");
    assert.equal(c.danger, undefined, m);
    assert.equal(c.intent, "flow_unfamiliar_location", m);
  }
  assert.equal(classify("gaadi ko dhakka de do", "home").danger, undefined);
});
