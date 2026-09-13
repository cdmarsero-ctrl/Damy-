import type { Cefr, ExamName, ExerciseType } from "@prisma/client";

/**
 * Exam practice modules.
 *
 * Each module is a single timed section rather than a whole paper — a learner
 * with 30 minutes should be able to complete something meaningful, and full
 * papers are assembled from modules in the UI.
 *
 * Productive tasks (writing, speaking) carry a `rubric` instead of a closed
 * answer key; those are routed to the AI/rules writing assessor, which scores
 * against the rubric's band descriptors.
 */

export interface ExamTaskSeed {
  type: ExerciseType;
  prompt: string;
  payload: Record<string, unknown>;
  solution: Record<string, unknown>;
  rubric?: Record<string, unknown>;
  points?: number;
}

export interface ExamModuleSeed {
  exam: ExamName;
  slug: string;
  section: string;
  title: string;
  description: string;
  cefr: Cefr;
  durationMin: number;
  instructions: string;
  tasks: ExamTaskSeed[];
}

export const EXAM_MODULES: ExamModuleSeed[] = [
  // ===================== IELTS =====================
  {
    exam: "IELTS",
    slug: "ielts-reading-matching-headings",
    section: "Reading",
    title: "Reading — Matching Headings",
    description:
      "The question type that most reliably separates band 6.5 from band 7.5, because it tests whether you can identify a paragraph's function rather than spot a keyword.",
    cefr: "C1",
    durationMin: 20,
    instructions:
      "Read the passage and match each paragraph to the heading that best summarises it. There are more headings than paragraphs. Do not choose a heading because it repeats a word from the paragraph — that is how the distractors are built.",
    tasks: [
      {
        type: "MATCHING",
        prompt: "Match each paragraph (A-D) to the most suitable heading.",
        payload: {
          passage: `**A.** For most of the twentieth century, urban planners treated traffic congestion as an engineering problem with an engineering solution: if roads were congested, the answer was more roads. The logic was intuitive and the results were consistent — and consistently disappointing. Within a few years of each expansion, congestion returned to roughly its previous level.

**B.** The explanation, now well established, is a phenomenon economists call induced demand. Road capacity does not merely accommodate existing journeys; it generates new ones. Drivers who had previously travelled at off-peak times, taken another route, or not travelled at all, respond to the improved conditions by joining the traffic. Equilibrium reasserts itself.

**C.** Evidence for this is unusually strong for a question in transport policy. A widely cited analysis of American metropolitan areas found that vehicle kilometres travelled rose in almost exact proportion to lane kilometres added — an elasticity close to one. Comparable studies in Europe and Japan have reached similar conclusions, and the finding has survived a range of methodological challenges.

**D.** What follows for policy is less straightforward than critics of road-building sometimes suggest. If demand is induced by capacity, it is also suppressed by its absence, which means some of the journeys prevented by congestion would have been economically valuable. The question is not whether to build, but which journeys a city wishes to make easy — and that is a political question, not a technical one.`,
          left: [
            { id: "A", label: "Paragraph A" },
            { id: "B", label: "Paragraph B" },
            { id: "C", label: "Paragraph C" },
            { id: "D", label: "Paragraph D" },
          ],
          right: [
            { id: "i", label: "i. A long-standing approach and its repeated failure" },
            { id: "ii", label: "ii. The mechanism behind the failure" },
            { id: "iii", label: "iii. Strength of the empirical support" },
            { id: "iv", label: "iv. Why the implications are contested" },
            { id: "v", label: "v. A proposal for congestion charging" },
            { id: "vi", label: "vi. The history of urban planning as a profession" },
          ],
        },
        solution: { pairs: { A: "i", B: "ii", C: "iii", D: "iv" } },
        rubric: {
          note: "Headings v and vi are distractors drawn from the passage's topic area but not its content — the classic IELTS trap.",
        },
        points: 4,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "According to paragraph D, what is the writer's view of critics of road-building?",
        payload: {
          options: [
            "They are correct and their conclusion follows from the evidence.",
            "They oversimplify: suppressed demand includes journeys with real value.",
            "They misunderstand the evidence on induced demand.",
            "They are motivated by political rather than technical concerns.",
          ],
        },
        solution: { answerIndex: 1 },
        points: 1,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "What does 'an elasticity close to one' mean in paragraph C?",
        payload: {
          options: [
            "Road building had almost no effect on traffic.",
            "Traffic increased by roughly the same proportion as capacity.",
            "The studies were of low statistical quality.",
            "Traffic doubled whenever capacity was added.",
          ],
        },
        solution: { answerIndex: 1 },
        points: 1,
      },
    ],
  },
  {
    exam: "IELTS",
    slug: "ielts-writing-task-2",
    section: "Writing",
    title: "Writing Task 2 — Discursive Essay",
    description:
      "The 40-minute, 250-word discursive essay that carries two thirds of the IELTS writing mark.",
    cefr: "C1",
    durationMin: 40,
    instructions:
      "Write at least 250 words. Spend five minutes planning. Address every part of the question — a brilliant essay that answers only half the prompt cannot exceed band 6 for Task Response.",
    tasks: [
      {
        type: "OPEN_WRITING",
        prompt:
          "Some people believe that universities should only admit students with the highest academic results, regardless of their background. Others argue that admissions should take social and educational disadvantage into account.\n\nDiscuss both views and give your own opinion.",
        payload: { minWords: 250, timeMinutes: 40 },
        solution: { minWords: 250 },
        rubric: {
          criteria: {
            taskResponse:
              "Band 7+: discusses BOTH views substantively and states a clear position sustained throughout. Band 6: addresses both but one is under-developed, or the position wavers.",
            coherenceCohesion:
              "Band 7+: logical progression, one clear central topic per paragraph, cohesive devices used flexibly. Band 6: arrangement is clear but mechanical, overuse of Firstly/Secondly/Finally.",
            lexicalResource:
              "Band 7+: less common vocabulary used with awareness of style and collocation, occasional inaccuracy. Band 6: adequate range, some errors in word choice that do not impede communication.",
            grammaticalRange:
              "Band 7+: a variety of complex structures, majority of sentences error-free. Band 6: mix of simple and complex forms, errors present but rarely impeding.",
          },
          guidance:
            "Two common ceiling-setters: answering only one view (caps Task Response at 5), and writing under 250 words (a penalty applies regardless of quality).",
        },
        points: 20,
      },
    ],
  },

  // ===================== Cambridge C1 Advanced =====================
  {
    exam: "CAE",
    slug: "cae-use-of-english-part-4",
    section: "Use of English",
    title: "Use of English — Key Word Transformation",
    description:
      "Six transformations testing grammar, collocation and phrasal verbs at once. Two marks each, awarded in halves.",
    cefr: "C1",
    durationMin: 15,
    instructions:
      "Complete the second sentence so it means the same as the first, using the word given. Do not change the word given. Use between three and six words, including the word given. Contractions count as two words.",
    tasks: [
      {
        type: "TRANSFORMATION",
        prompt: "It was a mistake to lend him the money.\n\nREGRET\n\nI ______________ him the money.",
        payload: { keyword: "REGRET", maxWords: 6 },
        solution: {
          answers: ["regret lending", "regret having lent", "regret ever lending"],
          mustInclude: ["regret"],
        },
        points: 2,
      },
      {
        type: "TRANSFORMATION",
        prompt:
          "Someone is servicing my car at the moment.\n\nHAVING\n\nI ______________ at the moment.",
        payload: { keyword: "HAVING", maxWords: 6 },
        solution: {
          answers: ["am having my car serviced"],
          mustInclude: ["having"],
        },
        points: 2,
      },
      {
        type: "TRANSFORMATION",
        prompt:
          "The weather was so bad that the match was cancelled.\n\nRESULTED\n\nThe bad weather ______________ of the match.",
        payload: { keyword: "RESULTED", maxWords: 6 },
        solution: {
          answers: ["resulted in the cancellation", "resulted in the cancelling"],
          mustInclude: ["resulted"],
        },
        points: 2,
      },
      {
        type: "TRANSFORMATION",
        prompt:
          "I didn't realise how difficult it would be until I started.\n\nUNTIL\n\nOnly ______________ I realise how difficult it would be.",
        payload: { keyword: "UNTIL", maxWords: 6 },
        solution: {
          answers: ["until I started did", "until I had started did"],
          mustInclude: ["until"],
        },
        points: 2,
      },
      {
        type: "TRANSFORMATION",
        prompt:
          "She denied that she had seen the document.\n\nHAVING\n\nShe denied ______________ the document.",
        payload: { keyword: "HAVING", maxWords: 4 },
        solution: {
          answers: ["having seen", "ever having seen", "having ever seen"],
          mustInclude: ["having"],
        },
        points: 2,
      },
      {
        type: "TRANSFORMATION",
        prompt:
          "The company will not consider the proposal unless it is submitted in writing.\n\nUNLESS\n\nThe proposal ______________ in writing.",
        payload: { keyword: "UNLESS", maxWords: 8 },
        solution: {
          answers: [
            "will not be considered unless submitted",
            "will not be considered unless it is submitted",
          ],
          mustInclude: ["unless"],
        },
        points: 2,
      },
    ],
  },

  // ===================== Cambridge C2 Proficiency =====================
  {
    exam: "CPE",
    slug: "cpe-reading-gapped-text",
    section: "Reading",
    title: "Reading — Gapped Text",
    description:
      "Paragraph insertion, testing cohesion and text structure at C2. The hardest reading task in the Cambridge suite.",
    cefr: "C2",
    durationMin: 20,
    instructions:
      "Choose the paragraph that fits each gap. There is one extra paragraph you do not need. The answer is determined by cohesive links — reference words, lexical chains and logical connectors — not by topic similarity.",
    tasks: [
      {
        type: "MATCHING",
        prompt: "Match each gap to the paragraph that fits it.",
        payload: {
          passage: `The idea that language shapes thought has had a turbulent century. Benjamin Lee Whorf's claim — that the categories available in a language determine what its speakers can readily conceive — was enormously influential in the 1940s and comprehensively unfashionable by the 1970s.

**[GAP 1]**

The revival, when it came, was more modest in its claims and far more careful in its methods. Rather than asking whether language determines thought, researchers asked whether it influences particular cognitive tasks under particular conditions.

**[GAP 2]**

Colour perception provided the most persuasive early findings. Speakers of Russian, which has separate basic terms for lighter and darker blue, discriminate between those shades marginally faster than English speakers — but the advantage vanishes when participants perform a simultaneous verbal task.

**[GAP 3]**

What survives, then, is a considerably weaker thesis than Whorf proposed, and a considerably more interesting one than his critics allowed. Language does not build the walls of the mind. It does, reliably, leave furniture in the way.`,
          left: [
            { id: "g1", label: "Gap 1" },
            { id: "g2", label: "Gap 2" },
            { id: "g3", label: "Gap 3" },
          ],
          right: [
            {
              id: "a",
              label:
                "A. The reaction was severe. Whorf's evidence was reassessed and found wanting, his Hopi data disputed, and for a generation the very suggestion of linguistic influence on cognition was treated as a mark of methodological naivety.",
            },
            {
              id: "b",
              label:
                "B. That qualification matters enormously. It suggests the effect operates through language actively recruited during the task, not through permanent restructuring of perception — precisely the distinction Whorf's formulation could not accommodate.",
            },
            {
              id: "c",
              label:
                "C. Posed that way, the question became tractable. Effects turned out to be real, small, and heavily dependent on whether a task encouraged participants to verbalise.",
            },
            {
              id: "d",
              label:
                "D. Multilingualism has since become the dominant research paradigm in the field, with particular attention to the age of acquisition.",
            },
          ],
        },
        solution: { pairs: { g1: "a", g2: "c", g3: "b" } },
        rubric: {
          note: "D is the distractor: on-topic, but it introduces multilingualism, which the passage never takes up. The real evidence is cohesive — 'The reaction' after a claim of unfashionableness; 'Posed that way' after a reformulated question; 'That qualification' after the caveat about the verbal task.",
        },
        points: 3,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt:
          "What does the final sentence — “It does, reliably, leave furniture in the way” — convey?",
        payload: {
          options: [
            "Language creates permanent barriers to certain thoughts.",
            "Language makes some cognitive routes more awkward without making them impossible.",
            "The research on this question is inconclusive.",
            "Whorf was substantially correct after all.",
          ],
        },
        solution: { answerIndex: 1 },
        points: 1,
      },
    ],
  },

  // ===================== TOEFL =====================
  {
    exam: "TOEFL",
    slug: "toefl-integrated-writing",
    section: "Writing",
    title: "Integrated Writing — Reading and Lecture",
    description:
      "Summarise how a lecture responds to a reading passage. Twenty minutes, 150-225 words. Scored for accuracy and completeness, not for your own opinion.",
    cefr: "C1",
    durationMin: 20,
    instructions:
      "Summarise the points made in the lecture, explaining how they challenge specific points in the reading. Do NOT give your own opinion — TOEFL penalises it here. Use reporting language throughout.",
    tasks: [
      {
        type: "OPEN_WRITING",
        prompt: `**READING PASSAGE**

Four-day working weeks have been proposed as a solution to declining workplace wellbeing. Advocates advance three arguments. First, productivity is maintained because workers compensate with greater focus. Second, recruitment improves, since a shorter week is a powerful differentiator in competitive labour markets. Third, environmental benefits follow from reduced commuting.

**LECTURE (transcript)**

"Now, the reading makes three claims, and I want to complicate all of them.

On productivity — yes, the trials do show maintained output. But look at who ran them. Almost all were self-selected knowledge-work firms, where output is hard to measure and workers had substantial autonomy already. We have very little evidence from manufacturing, healthcare or retail, where the work is the hours.

On recruitment — it's a differentiator only while it's unusual. If everyone adopts it, the advantage disappears by definition. That's not a benefit of the policy; it's a benefit of being early.

And the environmental point is the weakest. Several studies found total emissions roughly unchanged: people used the extra day for leisure travel, which more than offset the commuting they'd saved."`,
        payload: { minWords: 150, maxWords: 225, timeMinutes: 20 },
        solution: { minWords: 150 },
        rubric: {
          criteria: {
            completeness:
              "Score 5: all three counterpoints are present and accurately linked to the reading point they challenge. Score 3: one counterpoint is missing or misattributed.",
            accuracy:
              "The selection-bias point must be represented as a limitation on the evidence, not as a claim that productivity falls. This is the most common error on this task type.",
            language:
              "Score 5: reporting language throughout (the lecturer argues/counters/points out), varied paraphrase, no lifting from the passage.",
            neutrality: "Any statement of the writer's own opinion caps the score at 3.",
          },
        },
        points: 20,
      },
    ],
  },
  {
    exam: "TOEFL",
    slug: "toefl-listening-lecture",
    section: "Listening",
    title: "Listening — Academic Lecture",
    description:
      "An academic lecture with attitude and inference questions — where TOEFL listening scores are actually lost.",
    cefr: "C1",
    durationMin: 15,
    instructions:
      "Take notes as you read the transcript. Questions test main idea, detail, attitude and inference. Attitude questions depend on hedging and stress, not on content words.",
    tasks: [
      {
        type: "LISTENING_COMPREHENSION",
        prompt: "What is the lecturer's attitude to the 'hydraulic' model of memory?",
        payload: {
          transcript: `"So the older literature talks about memory as though it were a container — you put things in, they sit there, sometimes they leak out. The hydraulic metaphor. And I'll be honest, it's a wonderfully intuitive model. It's also, as far as we can tell, wrong in almost every respect that matters.

Retrieval isn't reading from storage. It's reconstruction. Every time you recall an event, you rebuild it from fragments, and — this is the part that unsettles people — you rebuild it in the context you're in now. Which means the act of remembering changes the memory. Reconsolidation, we call it.

Now, I don't want to overstate this. The reconstructive account has its own difficulties, and there are researchers I respect who think we've swung too far. But the container model? No, I think that one's finished."`,
          options: [
            "He accepts it as broadly accurate",
            "He finds it appealing but considers it fundamentally mistaken",
            "He is undecided between it and the reconstructive account",
            "He thinks it has been unfairly dismissed",
          ],
        },
        solution: { answerIndex: 1 },
        points: 2,
      },
      {
        type: "LISTENING_COMPREHENSION",
        prompt:
          "Why does the lecturer say “I don't want to overstate this”?",
        payload: {
          transcript: "(see above)",
          options: [
            "To signal that he is about to qualify his own position",
            "To indicate that he does not understand the research",
            "To introduce a stronger version of his argument",
            "To disagree with the container model again",
          ],
        },
        solution: { answerIndex: 0 },
        points: 2,
      },
      {
        type: "LISTENING_COMPREHENSION",
        prompt: "What can be inferred about reconsolidation from the lecture?",
        payload: {
          transcript: "(see above)",
          options: [
            "It shows memories are stored permanently once formed.",
            "Recalling a memory can alter it.",
            "It applies only to emotionally significant events.",
            "It has been conclusively disproved.",
          ],
        },
        solution: { answerIndex: 1 },
        points: 2,
      },
    ],
  },
];
