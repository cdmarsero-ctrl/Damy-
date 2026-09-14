import type { TrackSeed } from "./types";

/**
 * Professional communication. The through-line is *face* — how English speakers
 * disagree, refuse, chase and escalate without rupturing a working relationship.
 * That is a pragmatic skill, not a vocabulary one, and it is where highly
 * accurate C1 speakers most often come unstuck at work.
 */
export const BUSINESS_TRACK: TrackSeed = {
  slug: "professional-communication",
  title: "Professional Communication",
  description:
    "Negotiate, disagree, refuse and persuade in English without damaging the relationship. Diplomatic distancing, meeting control, and the written registers of working life.",
  goal: "BUSINESS",
  cefr: "C1",
  icon: "briefcase",
  accent: "emerald",
  units: [
    {
      slug: "diplomatic-language",
      title: "Diplomatic Language",
      description: "Softening, distancing and the grammar of saying no.",
      cefr: "C1",
      lessons: [
        {
          slug: "the-grammar-of-disagreement",
          title: "The Grammar of Disagreement",
          subtitle: "Why 'I disagree' is rarely the right sentence",
          skill: "SPEAKING",
          cefr: "C1",
          estimatedMinutes: 13,
          xpReward: 25,
          objectives: [
            "Use distancing tenses and modals to soften a challenge",
            "Deploy the concede-then-object structure",
            "Recognise when directness is the stronger choice",
          ],
          content: `English disagreement runs on **distance**. The further a construction is from the bare present indicative, the softer it lands.

> *That's wrong.*
> *I think that's wrong.*
> *I'm not sure that's right.*
> *I wonder whether that's quite right.*
> *I'd have thought there might be an argument the other way.*

Each step adds distance: a mental-process verb, a negation of certainty rather than an assertion of error, a hypothetical modal, a past-form modal about a present situation. The last sentence disagrees completely while containing no negative statement about the other person's view at all.

**The three distancing resources:**

1. **Past forms for present meaning.** *I was wondering whether…* / *I'd have thought…* / *I was hoping we might…* Nothing about these is past. The past form signals tentativeness.
2. **Modals of possibility.** *might*, *could*, *may* — each one converts an assertion into an option.
3. **Impersonal subjects.** *There seems to be an issue* rather than *You've made a mistake*. The problem exists; nobody caused it.

**The concede-then-object move** is the workhorse:

> *You're right that the timeline is tight — my concern would be whether QA gets enough runway.*

Three parts: genuine concession, a hinge, and an objection framed as a personal concern rather than a fact. Note 'would be' — even the concern is hypothetical.

**When to be direct.** Diplomatic language has a cost: it can obscure that you are actually objecting. In a safety, legal or ethical matter, hedging is not politeness but negligence. *I can't sign this off* has no softened equivalent that does the same job.`,
          culturalNote:
            "Indirectness levels differ sharply across English-speaking cultures. British professional English is among the most indirect in the world — 'I'm not entirely sure that's the best approach' can mean 'absolutely not'. Dutch, German and Israeli business cultures read that as evasive. American English sits between. If you are working across these cultures, the real skill is reading which register your counterpart is using, not defaulting to your own.",
          exercises: [
            {
              type: "DRAG_ORDER",
              skill: "SPEAKING",
              cefr: "C1",
              prompt: "Order these from most direct to most diplomatic.",
              payload: {
                items: [
                  { id: "wrong", label: "That won't work." },
                  { id: "notsure", label: "I'm not sure that would work." },
                  { id: "wonder", label: "I wonder whether that would quite work." },
                  { id: "thought", label: "I'd have thought we might run into difficulties there." },
                ],
              },
              solution: { order: ["wrong", "notsure", "wonder", "thought"] },
              explanation:
                "Each step adds a layer: negated certainty, then 'wonder whether' plus the softener 'quite', then a past modal with an impersonal 'we' that shares the problem rather than assigning it.",
              points: 15,
              tags: ["diplomacy", "modals"],
            },
            {
              type: "TRANSFORMATION",
              skill: "SPEAKING",
              cefr: "C1",
              prompt:
                "Rewrite diplomatically using the word given.\n\n“You didn't send the figures I asked for.”",
              instructions: "Use WONDERING. Between 8 and 16 words.",
              payload: { keyword: "WONDERING", original: "You didn't send the figures I asked for." },
              solution: {
                answers: [
                  "I was wondering whether you'd had a chance to send the figures",
                  "I was wondering if you had had a chance to send the figures",
                  "I was wondering whether you had a chance to send those figures",
                  "I was wondering if you'd managed to send the figures yet",
                ],
                mustInclude: ["wondering"],
              },
              explanation:
                "'I was wondering whether you'd had a chance to…' is the standard professional chase. It removes the accusation entirely: the past continuous distances the request, and 'had a chance' pre-supplies the excuse.",
              points: 20,
              tags: ["transformation", "diplomacy"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "SPEAKING",
              cefr: "C1",
              prompt:
                "A contractor has proposed a design that would breach fire regulations. Which response is appropriate?",
              payload: {
                options: [
                  "I was wondering whether we might possibly look at some alternatives.",
                  "I'm not entirely sure that's quite the direction we'd want to go in.",
                  "We can't do this — it breaches Part B. We'll need a different approach.",
                  "That's an interesting thought; let me come back to you.",
                ],
              },
              solution: { answerIndex: 2 },
              explanation:
                "Diplomatic language is a tool, not a default. On a regulatory breach, hedging risks the objection not being understood as an objection. Note that the direct version is still professional — it names the reason and offers a way forward.",
              points: 15,
              tags: ["pragmatics", "judgement"],
            },
            {
              type: "ERROR_CORRECTION",
              skill: "WRITING",
              cefr: "C1",
              prompt: "Fix the register problem in each line of this email to an external client.",
              payload: {
                lines: [
                  "Hi — just chasing this, you never got back to me.",
                  "We can't do the date you want, it doesn't work for us.",
                  "Let me know ASAP as we're waiting around here.",
                ],
              },
              solution: {
                corrections: [
                  {
                    accepted: [
                      "I hope you're well. I wanted to follow up on my previous message",
                      "I'm following up on my earlier email",
                      "I wanted to follow up on my previous message",
                      "I hope this finds you well. I wanted to follow up on my earlier email",
                    ],
                    hint: "'You never got back to me' assigns blame. Follow up without the accusation.",
                  },
                  {
                    accepted: [
                      "Unfortunately that date isn't something we're able to accommodate",
                      "Unfortunately we aren't able to accommodate that date",
                      "I'm afraid that date isn't one we're able to accommodate",
                      "Regrettably we are unable to accommodate that date",
                    ],
                    hint: "Soften the refusal and give it a reason-shaped frame rather than 'it doesn't work for us'.",
                  },
                  {
                    accepted: [
                      "It would be helpful to have your confirmation by Friday",
                      "Could you confirm by Friday",
                      "I would be grateful for your confirmation by Friday",
                      "Any confirmation you can give by Friday would be helpful",
                    ],
                    hint: "'ASAP' plus 'waiting around' reads as pressure and complaint. Give a specific deadline instead.",
                  },
                ],
              },
              explanation:
                "Three separate failures: blame ('you never got back'), bluntness ('we can't'), and pressure ('ASAP'). Each has a standard professional repair — and note that all three repairs are *longer*. Efficiency and diplomacy trade off, and with an external client, diplomacy wins.",
              points: 25,
              tags: ["email", "register"],
            },
          ],
        },
        {
          slug: "negotiation-language",
          title: "Negotiating in English",
          subtitle: "Conditional bargaining and the language of concession",
          skill: "SPEAKING",
          cefr: "C1",
          estimatedMinutes: 14,
          xpReward: 30,
          objectives: [
            "Use conditional structures to trade rather than concede",
            "Signal flexibility without committing",
            "Close without appearing to have won",
          ],
          content: `Negotiation in English is built on the conditional. The single most useful pattern:

> *If you could **X**, we'd be able to **Y**.*

Every concession is conditional on a return. Offering a concession unconditionally — *we could probably do that* — spends your leverage and buys nothing.

**Signalling flexibility without commitment:**
> *There may be some room on the timeline.*
> *That's not impossible, depending on volume.*
> *We could potentially look at that as part of a wider package.*

Each hints at movement while committing to nothing specific. Note 'as part of a wider package' — it makes the concession contingent on the whole deal, so it evaporates if the deal changes.

**The hypothetical probe** lets you test a position without making an offer:
> *Hypothetically, if we were to bring the date forward, where would that leave us on price?*

'Were to' is crucial. It marks the whole thing as unreal, so nothing said in answer is binding.

**Closing.** The best close leaves the other side feeling they did well:
> *I think that's about as far as either of us can go. Shall we write it up?*
> *That works for us. You've been tough on the price, I'll give you that.*

A negotiation you win visibly is one the other party will want to reopen.`,
          exercises: [
            {
              type: "GAP_FILL",
              skill: "SPEAKING",
              cefr: "C1",
              prompt:
                "Complete the conditional trade: “If you (1) ___ able to commit to a two-year term, we (2) ___ look again at the unit price.”",
              payload: { gaps: [{ placeholder: "verb" }, { placeholder: "modal + verb" }],
              },
              solution: {
                answers: [
                  ["were", "was", "were to be"],
                  ["could", "would be able to", "might be able to", "'d be able to", "would"],
                ],
              },
              explanation:
                "The second conditional ('were… could') marks this as an exploration rather than an offer. Swap in the first conditional ('are… will') and you have committed.",
              points: 15,
              tags: ["conditionals", "negotiation"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "SPEAKING",
              cefr: "C1",
              prompt:
                "Which reply keeps the most leverage while still sounding constructive?",
              payload: {
                context: "The client asks: “Can you do it for 40,000?”",
                options: [
                  "No, that's too low.",
                  "We could probably manage 42,000.",
                  "40,000 is difficult on the current scope. What would you want to take out?",
                  "Let me check with my manager.",
                ],
              },
              solution: { answerIndex: 2 },
              explanation:
                "It declines without refusing, names the constraint (scope, not greed), and hands the next move back. Option 2 concedes 3,000 for nothing; option 1 closes the conversation; option 4 reveals you cannot decide.",
              points: 15,
              tags: ["negotiation", "pragmatics"],
            },
            {
              type: "MATCHING",
              skill: "SPEAKING",
              cefr: "C1",
              prompt: "Match each phrase to its negotiating function.",
              payload: {
                left: [
                  { id: "a", label: "Hypothetically, if we were to move the date…" },
                  { id: "b", label: "That's not impossible, depending on volume." },
                  { id: "c", label: "I think that's about as far as either of us can go." },
                  { id: "d", label: "Let me make sure I've understood: you need delivery before the quarter ends." },
                ],
                right: [
                  { id: "probe", label: "Probing without committing" },
                  { id: "flex", label: "Signalling flexibility, conditionally" },
                  { id: "close", label: "Closing while saving face" },
                  { id: "check", label: "Checking understanding to buy time" },
                ],
              },
              solution: { pairs: { a: "probe", b: "flex", c: "close", d: "check" } },
              explanation:
                "The fourth is underrated: restating the other side's position accurately buys thinking time, demonstrates good faith, and occasionally reveals that they have overstated their own need.",
              points: 20,
              tags: ["negotiation"],
            },
            {
              type: "SPEAKING_PROMPT",
              skill: "SPEAKING",
              cefr: "C1",
              prompt:
                "A supplier has asked for a 12% price increase. You can accept 6%. Speak your opening response — decline the number, keep the relationship, and open a trade.",
              instructions:
                "Record or type your response. Aim for 45-70 words, using at least one conditional trade.",
              payload: { minWords: 40, allowSpeech: true },
              solution: { minWords: 40 },
              explanation:
                "A strong response names the constraint, avoids a flat 'no', and attaches any movement to something you want: “Twelve is going to be very hard for us this year — the budget simply isn't there. If you could hold at six for twelve months, I'd be willing to look at extending the term, which gives you certainty on volume.”",
              points: 25,
              tags: ["production", "negotiation"],
            },
          ],
        },
      ],
    },
    {
      slug: "written-professional",
      title: "Written Professional Registers",
      description: "Email, reports and proposals — and the register shifts between them.",
      cefr: "C1",
      lessons: [
        {
          slug: "email-register",
          title: "Calibrating Email Register",
          subtitle: "Five relationships, five emails, one message",
          skill: "WRITING",
          cefr: "C1",
          estimatedMinutes: 12,
          xpReward: 25,
          objectives: [
            "Match opening, ask and close to the relationship",
            "Recognise the markers that place an email on the formality scale",
            "Chase, refuse and escalate in writing without damage",
          ],
          content: `The same message — *the deadline has moved, I need your section by Tuesday* — changes completely depending on who is reading it.

**To a close colleague:**
> *Heads up — deadline's moved. Any chance of your bit by Tuesday?*

**To a peer in another team:**
> *Hi Sam, the deadline's been brought forward. Would Tuesday be doable for your section?*

**To a senior colleague:**
> *Hi Priya, the client has moved the deadline to Thursday. Would it be possible to have your section by Tuesday? Happy to help if that's tight.*

**To an external client:**
> *Dear Mr Okafor, I am writing to let you know that the schedule has been brought forward. It would be extremely helpful if we could receive your section by Tuesday.*

**Escalating, after two ignored requests:**
> *Hi Sam, I wanted to flag that without the section by end of day tomorrow we won't be able to meet the client deadline. I've copied Priya so she's aware of the timing risk.*

The markers that move an email along the scale:

| Informal | Formal |
|---|---|
| Contractions | Full forms |
| Phrasal verbs (*get back to*) | Latinate verbs (*respond*) |
| Direct questions (*Can you…?*) | Embedded (*Would it be possible to…?*) |
| Ellipsis (*Heads up*) | Full clauses |
| First names, no greeting | Title + surname |

The escalation email deserves study. Note what it does **not** do: it does not express annoyance, does not mention the previous requests, and does not accuse. It states a consequence and makes a copy visible. In professional English, the cc *is* the escalation — saying so explicitly would be the aggressive version.`,
          exercises: [
            {
              type: "MATCHING",
              skill: "WRITING",
              cefr: "C1",
              prompt: "Match each closing line to the relationship it fits.",
              payload: {
                left: [
                  { id: "a", label: "Cheers!" },
                  { id: "b", label: "Thanks — shout if anything's unclear." },
                  { id: "c", label: "Many thanks in advance for your help with this." },
                  { id: "d", label: "I look forward to hearing from you at your earliest convenience." },
                ],
                right: [
                  { id: "close", label: "Close colleague" },
                  { id: "peer", label: "Peer in another team" },
                  { id: "senior", label: "Senior colleague or known client" },
                  { id: "formal", label: "Formal external correspondence" },
                ],
              },
              solution: { pairs: { a: "close", b: "peer", c: "senior", d: "formal" } },
              explanation:
                "'At your earliest convenience' is genuinely formal but carries a faint edge of impatience in British usage — it is best kept for correspondence that may end up in a file.",
              points: 15,
              tags: ["register", "email"],
            },
            {
              type: "MULTI_SELECT",
              skill: "WRITING",
              cefr: "C1",
              prompt: "Select every feature that makes an email MORE formal.",
              payload: {
                options: [
                  "Using 'I am writing to' rather than 'Just a quick one'",
                  "Using 'Would it be possible to…' rather than 'Can you…'",
                  "Using 'get back to me' rather than 'respond'",
                  "Spelling out contractions",
                  "Opening with 'Hi' rather than 'Dear'",
                  "Using the passive to avoid naming who failed",
                ],
              },
              solution: { answerIndexes: [0, 1, 3, 5] },
              explanation:
                "'Get back to me' is a phrasal verb — informal — and 'Hi' is less formal than 'Dear'. The agency-hiding passive genuinely does raise formality, which is exactly why bureaucratic writing is full of it.",
              points: 20,
              tags: ["register"],
            },
            {
              type: "REGISTER_SHIFT",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Rewrite for an external client you have never met: “Hey — we messed up the invoice, sorry! Ignore it, new one coming.”",
              payload: {
                original: "Hey — we messed up the invoice, sorry! Ignore it, new one coming.",
                targetRegister: "FORMAL",
                minWords: 25,
              },
              solution: {
                mustInclude: ["apolog", "invoice", "correct"],
                mustAvoid: ["hey", "messed up", "ignore it"],
                minWords: 25,
              },
              explanation:
                "A professional version: “Dear Ms Adeyemi, I am writing to apologise for an error in the invoice sent on 3 March. Please disregard that document; a corrected invoice will follow today. I am sorry for the inconvenience.” Note 'disregard' for 'ignore', a specific reference, and a stated remedy with a timescale.",
              points: 20,
              tags: ["register", "apology"],
              lexicalItem: "ascertain",
            },
            {
              type: "OPEN_WRITING",
              skill: "WRITING",
              cefr: "C1",
              prompt:
                "Write an escalation email. A colleague has twice failed to supply data you need; the client deadline is tomorrow. You need the data without making an enemy.",
              instructions:
                "80-130 words. State the consequence, not the grievance. Decide whether to copy anyone, and let the reader see it.",
              payload: { minWords: 70 },
              solution: { minWords: 70 },
              explanation:
                "Check your draft against three tests. Does it mention the previous requests? (It should not — that is a grievance.) Does it state a consequence with a time? (It must.) Could the recipient forward it to their manager without embarrassment? (If not, rewrite it — in practice, they will.)",
              points: 25,
              tags: ["email", "escalation"],
            },
          ],
        },
      ],
    },
  ],
};
