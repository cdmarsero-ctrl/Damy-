import type { TrackSeed } from "./types";

/**
 * Exam preparation and advanced listening. Deliberately combined: the listening
 * sub-skills examinations test — note-taking under time pressure, coping with
 * unfamiliar accents, tracking a speaker's stance across a long turn — are the
 * same ones learners need outside the exam hall, and teaching them only as exam
 * technique produces candidates who pass and then struggle.
 */
export const EXAM_TRACK: TrackSeed = {
  slug: "exam-preparation",
  title: "Exam Preparation & Advanced Listening",
  description:
    "IELTS, Cambridge C1/C2 and TOEFL technique, built on the underlying skills: native-speed listening across accents, note-taking, key-word transformation and timed writing.",
  goal: "EXAM",
  cefr: "C1",
  icon: "target",
  accent: "rose",
  units: [
    {
      slug: "listening-under-pressure",
      title: "Listening Under Pressure",
      description: "Native-speed input, unfamiliar accents, and taking notes without losing the thread.",
      cefr: "C1",
      lessons: [
        {
          slug: "accents-and-reduction",
          title: "Accents and Reduction",
          subtitle: "Why you understand the textbook and not the podcast",
          skill: "LISTENING",
          cefr: "C1",
          estimatedMinutes: 15,
          xpReward: 30,
          accent: "UK",
          objectives: [
            "Predict how function words reduce in connected speech",
            "Identify the systematic vowel differences between major accents",
            "Use context to recover words that the acoustic signal did not deliver",
          ],
          content: `Most listening difficulty at C1 is not vocabulary. It is that fluent English deletes, reduces and runs words together, and course audio does not.

**Weak forms.** Function words have a strong citation form and a weak connected-speech form, and the weak one is what you will actually hear:

| Word | Strong | Weak |
|---|---|---|
| and | /ænd/ | /ən/, /n/ |
| of | /ɒv/ | /əv/, /ə/ |
| have | /hæv/ | /əv/, /v/ |
| to | /tuː/ | /tə/ |
| for | /fɔː/ | /fə/ |
| can | /kæn/ | /kən/ |

So *a cup of tea* becomes /ə kʌpə tiː/, and *I would have gone* becomes /aɪdəv gɒn/. If you are listening for /wʊd hæv/, you will never hear it, because nobody says it.

**Elision and assimilation.** Sounds disappear or change to suit their neighbours:
> *next door* → /neks dɔː/ (the /t/ goes)
> *ten boys* → /tem bɔɪz/ (the /n/ assimilates to /m/)
> *did you* → /dɪdʒu/ (palatalisation)

**Accent variation** is systematic, not random. The three differences that cause most trouble:

1. **Rhoticity.** US, Canadian, Irish and Scottish accents pronounce /r/ after a vowel; standard British and Australian do not. *Card* is /kɑːrd/ or /kɑːd/.
2. **The TRAP-BATH split.** Southern British says /bɑːθ/; northern British, American and Australian say /bæθ/.
3. **The vowel in LOT/THOUGHT.** Most American accents merge vowels that British keeps distinct — *cot* and *caught* sound identical to many Americans.

**The strategy that works** is not "listen harder". It is prediction: because these processes are regular, you can anticipate what a reduced form corresponds to. A learner who knows *would have* becomes /dəv/ hears it. One who does not, hears nothing.`,
          culturalNote:
            "IELTS and Cambridge exams deliberately include a spread of accents — British, Australian, North American and increasingly New Zealand and Irish. TOEFL historically used North American accents almost exclusively but now includes others. Practising with only one accent is one of the commonest reasons for an unexpectedly low listening score.",
          exercises: [
            {
              type: "DICTATION",
              skill: "LISTENING",
              cefr: "C1",
              prompt:
                "Transcribe the full sentence. Heard as: /aɪdəv θɔːt ʃiːd əv tʰəʊld əs baɪ naʊ/",
              instructions:
                "Write the sentence in normal spelling. Use the reduction table above to expand the weak forms.",
              payload: {
                audioHint: "/aɪdəv θɔːt ʃiːd əv tʰəʊld əs baɪ naʊ/",
                accent: "UK",
              },
              solution: { text: "I would have thought she would have told us by now" },
              explanation:
                "Two instances of 'would have' reduced to /dəv/. Written out it is nine words; acoustically it is closer to six. This is the single most common pattern in spoken English narrative and it is invisible on the page.",
              points: 20,
              tags: ["weak-forms", "dictation"],
            },
            {
              type: "MULTIPLE_CHOICE",
              skill: "LISTENING",
              cefr: "C1",
              prompt:
                "A speaker says /aɪ kən du: ɪt/ with a reduced vowel in the second word. What did they say?",
              payload: {
                options: [
                  "I can't do it",
                  "I can do it",
                  "Ambiguous — impossible to tell",
                  "I could do it",
                ],
              },
              solution: { answerIndex: 1 },
              explanation:
                "The schwa is the clue. Positive 'can' reduces to /kən/; negative 'can't' keeps a full vowel and is stressed — /kɑːnt/ or /kænt/. So an unstressed, reduced form is always positive. Learners who listen for the /t/ frequently mishear the negative, because in connected speech the /t/ is often not released at all.",
              points: 15,
              tags: ["weak-forms", "minimal-pairs"],
            },
            {
              type: "MATCHING",
              skill: "LISTENING",
              cefr: "C1",
              prompt: "Match each pronunciation to the accent most likely to produce it.",
              payload: {
                left: [
                  { id: "a", label: "/bɑːθ/ for 'bath', non-rhotic" },
                  { id: "b", label: "/bæθ/ for 'bath', rhotic" },
                  { id: "c", label: "/bæθ/ for 'bath', non-rhotic, raised vowels" },
                  { id: "d", label: "Rolled or tapped /r/, 'cot' and 'caught' distinct, /x/ in 'loch'" },
                ],
                right: [
                  { id: "rp", label: "Southern British" },
                  { id: "ga", label: "General American" },
                  { id: "au", label: "Australian" },
                  { id: "sco", label: "Scottish" },
                ],
              },
              solution: { pairs: { a: "rp", b: "ga", c: "au", d: "sco" } },
              explanation:
                "Rhoticity plus the TRAP-BATH split identifies most major accents between them. Australian is non-rhotic like southern British but uses the short /æ/ in 'bath' and raises its front vowels, which is why 'mate' can sound close to 'mite' to other English speakers.",
              points: 20,
              tags: ["accents"],
            },
            {
              type: "NOTE_TAKING",
              skill: "LISTENING",
              cefr: "C1",
              prompt:
                "Take notes on this extract, then list the key points.\n\n“Right, three things on the budget. First, we're about eight per cent over on staffing — that's mostly agency cover for the two vacancies. Second, the software renewal came in cheaper than forecast, which offsets roughly half of that. And third — this is the one I'd flag — we've had no capital spend at all this quarter, which looks good now but means everything lands in Q4.”",
              instructions:
                "Capture the substance, not the words. Three points, plus what the speaker actually wants you to notice.",
              payload: {
                transcript:
                  "Right, three things on the budget. First, we're about eight per cent over on staffing — that's mostly agency cover for the two vacancies. Second, the software renewal came in cheaper than forecast, which offsets roughly half of that. And third — this is the one I'd flag — we've had no capital spend at all this quarter, which looks good now but means everything lands in Q4.",
              },
              solution: {
                keyPoints: [
                  "staffing 8% over budget due to agency cover for two vacancies",
                  "software renewal cheaper than forecast, offsets about half the overspend",
                  "no capital spend this quarter",
                  "capital spend will all land in Q4 — the speaker's main concern",
                ],
              },
              explanation:
                "The discourse marker 'this is the one I'd flag' is the most important thing in the extract — it tells you which of three points the speaker considers the real issue. Exam note-taking rewards catching that signposting, not transcribing numbers.",
              points: 25,
              tags: ["note-taking", "signposting"],
            },
          ],
        },
      ],
    },
    {
      slug: "exam-technique",
      title: "Exam Technique",
      description: "Key-word transformation, timed writing and the mechanics of scoring well.",
      cefr: "C1",
      lessons: [
        {
          slug: "key-word-transformation",
          title: "Key-Word Transformation",
          subtitle: "The Cambridge question that tests everything at once",
          skill: "GRAMMAR",
          cefr: "C1",
          estimatedMinutes: 16,
          xpReward: 35,
          objectives: [
            "Identify which structure a key word is testing",
            "Work within the word limit, counting contractions correctly",
            "Recognise the recurring transformation families",
          ],
          content: `Cambridge C1 Advanced and C2 Proficiency both include key-word transformation: rewrite a sentence using a given word, keeping the meaning, within a word limit. It is the highest-value question type to practise because each item tests grammar, collocation and register simultaneously.

**The method:**

1. **Identify what the key word forces.** A key word is almost never arbitrary. *REGRET* means you need *regret + gerund* or *regret to inform*. *ACCOUNT* means *on account of* or *take into account* or *account for*.
2. **Find the structure, not the synonym.** Learners look for a word that means the same. Examiners are testing whether you can restructure.
3. **Count carefully.** Contractions count as the words they contract: *don't* = 2. The key word must appear unchanged — no *regretted* if the word is *REGRET*.

**The recurring families:**

| Tested structure | Typical key words |
|---|---|
| Passive / causative | GOT, HAD, BEING |
| Reported speech | ADMITTED, DENIED, ACCUSED, INSISTED |
| Conditionals & inversion | UNLESS, HAD, PROVIDED, BUT |
| Wish / regret | WISH, ONLY, REGRET, RATHER |
| Ability & possibility | MANAGED, ABLE, CHANCE, LIKELIHOOD |
| Phrasal verbs | PUT, TAKE, COME, GET |

**Worked example:**
> They said the fire was caused by faulty wiring. **PUT**
> *The fire ______________ faulty wiring.*

PUT plus the passive suggests *put down to* — "attribute to". Answer: *was put down to*. Five words? *was put down to* is four, leaving room. The full answer: *was put down to*.

Notice the process: the key word identified a phrasal verb, the original's 'was caused by' signalled the passive, and the gap length confirmed it.`,
          exercises: [
            {
              type: "TRANSFORMATION",
              skill: "GRAMMAR",
              cefr: "C1",
              prompt:
                "Complete using the word given. Use between three and six words.\n\n“I'm sorry I didn't tell you earlier.” → WISH\n\nI ______________ you earlier.",
              payload: { keyword: "WISH", original: "I'm sorry I didn't tell you earlier.", maxWords: 6 },
              solution: {
                answers: ["wish I had told", "wish I'd told", "wish that I had told"],
                mustInclude: ["wish"],
              },
              explanation:
                "Regret about the past takes 'wish + past perfect'. Note that 'wish I told' is a common and wrong answer — that pattern is for present regrets ('I wish I knew').",
              points: 15,
              tags: ["transformation", "wish"],
            },
            {
              type: "TRANSFORMATION",
              skill: "GRAMMAR",
              cefr: "C1",
              prompt:
                "“You won't pass unless you revise.” → LESS\n\nThe ______________ you revise, the less likely you are to pass.",
              payload: { keyword: "LESS", original: "You won't pass unless you revise.", maxWords: 4 },
              solution: {
                answers: ["less you revise", "less that you revise"],
                mustInclude: ["less"],
              },
              explanation:
                "The double comparative 'the + comparative…, the + comparative…'. Both halves need the definite article, and the second clause is already supplied — a strong hint about the structure being tested.",
              points: 15,
              tags: ["transformation", "comparatives"],
            },
            {
              type: "TRANSFORMATION",
              skill: "GRAMMAR",
              cefr: "C2",
              prompt:
                "“He only realised his mistake when the report was published.” → NOT\n\n______________ the report was published did he realise his mistake.",
              payload: { keyword: "NOT", original: "He only realised his mistake when the report was published.", maxWords: 4 },
              solution: {
                answers: ["Not until", "It was not until"],
                mustInclude: ["Not"],
              },
              explanation:
                "'Not until X did Y' — a negative adverbial fronted, forcing inversion. The inverted auxiliary 'did he realise' is already given, which tells you the answer must be a negative adverbial.",
              points: 20,
              tags: ["transformation", "inversion"],
            },
            {
              type: "TRANSFORMATION",
              skill: "GRAMMAR",
              cefr: "C1",
              prompt:
                "“Nobody expected the committee to reject the proposal.” → TAKEN\n\nEveryone ______________ surprise by the committee's rejection of the proposal.",
              payload: { keyword: "TAKEN", original: "Nobody expected the committee to reject the proposal.", maxWords: 3 },
              solution: {
                answers: ["was taken by", "was taken aback by"],
                mustInclude: ["taken"],
              },
              explanation:
                "'Take somebody by surprise' in the passive. The word 'surprise' is already in the gap-sentence, which fixes the collocation — the only decision left is the passive form.",
              points: 15,
              tags: ["transformation", "collocation"],
            },
          ],
        },
      ],
    },
  ],
};
