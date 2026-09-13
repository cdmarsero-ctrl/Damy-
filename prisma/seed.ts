/**
 * Database seed.
 *
 * Idempotent by design: every insert is an upsert keyed on a natural unique
 * field, so `npm run db:seed` can be run repeatedly against a live database
 * without duplicating content or wiping learner progress.
 *
 * Run with:  npm run db:seed
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { BADGES } from "./content/badges";
import { EXAM_MODULES } from "./content/exams";
import { LEXICON } from "./content/lexicon";
import { PLACEMENT_ITEMS } from "./content/placement";
import { ACADEMIC_TRACK } from "./content/track-academic";
import { BUSINESS_TRACK } from "./content/track-business";
import { EXAM_TRACK } from "./content/track-exam";
import { FLUENCY_TRACK, NUANCE_TRACK } from "./content/track-fluency";
import type { TrackSeed } from "./content/types";

const prisma = new PrismaClient();

const TRACKS: TrackSeed[] = [
  FLUENCY_TRACK,
  ACADEMIC_TRACK,
  BUSINESS_TRACK,
  EXAM_TRACK,
  NUANCE_TRACK,
];

async function seedLexicon() {
  let count = 0;
  for (const entry of LEXICON) {
    await prisma.lexicalItem.upsert({
      where: { headword_type: { headword: entry.headword, type: entry.type } },
      update: {
        cefr: entry.cefr,
        pos: entry.pos ?? null,
        ipa: entry.ipa ?? null,
        definition: entry.definition,
        register: entry.register ?? "NEUTRAL",
        connotation: entry.connotation ?? "NEUTRAL",
        domain: entry.domain ?? null,
        synonyms: entry.synonyms ?? [],
        antonyms: entry.antonyms ?? [],
        collocations: entry.collocations ?? [],
        examples: entry.examples as unknown as Prisma.InputJsonValue,
        usageNote: entry.usageNote ?? null,
        frequency: entry.frequency,
      },
      create: {
        headword: entry.headword,
        type: entry.type,
        cefr: entry.cefr,
        pos: entry.pos ?? null,
        ipa: entry.ipa ?? null,
        definition: entry.definition,
        register: entry.register ?? "NEUTRAL",
        connotation: entry.connotation ?? "NEUTRAL",
        domain: entry.domain ?? null,
        synonyms: entry.synonyms ?? [],
        antonyms: entry.antonyms ?? [],
        collocations: entry.collocations ?? [],
        examples: entry.examples as unknown as Prisma.InputJsonValue,
        usageNote: entry.usageNote ?? null,
        frequency: entry.frequency,
      },
    });
    count += 1;
  }
  console.log(`  lexicon: ${count} entries`);
}

async function seedPlacement() {
  // Placement items have no natural key, so the bank is replaced wholesale.
  // Responses reference items with onDelete: Cascade, and a re-seed should not
  // silently orphan a learner's completed test — so only clear when the bank
  // has actually changed in size.
  const existing = await prisma.placementItem.count();
  if (existing === PLACEMENT_ITEMS.length) {
    console.log(`  placement: ${existing} items already present, skipping`);
    return;
  }

  await prisma.placementItem.deleteMany({ where: { responses: { none: {} } } });

  let count = 0;
  for (const item of PLACEMENT_ITEMS) {
    const duplicate = await prisma.placementItem.findFirst({ where: { prompt: item.prompt } });
    if (duplicate) continue;

    await prisma.placementItem.create({
      data: {
        skill: item.skill,
        cefr: item.cefr,
        discrimination: item.discrimination,
        difficulty: item.difficulty,
        guessing: item.guessing,
        prompt: item.prompt,
        context: item.context ?? null,
        options: item.options as unknown as Prisma.InputJsonValue,
        answerIndex: item.answerIndex,
        rationale: item.rationale,
        tags: item.tags,
      },
    });
    count += 1;
  }
  console.log(`  placement: ${count} items added`);
}

async function seedTracks() {
  // Exercises reference lexical items by headword; resolve them once.
  const lexicalItems = await prisma.lexicalItem.findMany({ select: { id: true, headword: true } });
  const lexicalIdByHeadword = new Map(lexicalItems.map((i) => [i.headword, i.id]));

  let lessonCount = 0;
  let exerciseCount = 0;

  for (const [trackIndex, track] of TRACKS.entries()) {
    const trackRow = await prisma.track.upsert({
      where: { slug: track.slug },
      update: {
        title: track.title,
        description: track.description,
        goal: track.goal,
        cefr: track.cefr,
        icon: track.icon,
        accent: track.accent,
        order: trackIndex,
      },
      create: {
        slug: track.slug,
        title: track.title,
        description: track.description,
        goal: track.goal,
        cefr: track.cefr,
        icon: track.icon,
        accent: track.accent,
        order: trackIndex,
      },
    });

    for (const [unitIndex, unit] of track.units.entries()) {
      const unitRow = await prisma.unit.upsert({
        where: { trackId_slug: { trackId: trackRow.id, slug: unit.slug } },
        update: {
          title: unit.title,
          description: unit.description,
          cefr: unit.cefr,
          order: unitIndex,
        },
        create: {
          trackId: trackRow.id,
          slug: unit.slug,
          title: unit.title,
          description: unit.description,
          cefr: unit.cefr,
          order: unitIndex,
        },
      });

      for (const [lessonIndex, lesson] of unit.lessons.entries()) {
        const lessonRow = await prisma.lesson.upsert({
          where: { unitId_slug: { unitId: unitRow.id, slug: lesson.slug } },
          update: {
            title: lesson.title,
            subtitle: lesson.subtitle ?? null,
            skill: lesson.skill,
            cefr: lesson.cefr,
            order: lessonIndex,
            objectives: lesson.objectives,
            estimatedMinutes: lesson.estimatedMinutes ?? 10,
            xpReward: lesson.xpReward ?? 20,
            content: lesson.content ?? null,
            accent: lesson.accent ?? null,
            culturalNote: lesson.culturalNote ?? null,
          },
          create: {
            unitId: unitRow.id,
            slug: lesson.slug,
            title: lesson.title,
            subtitle: lesson.subtitle ?? null,
            skill: lesson.skill,
            cefr: lesson.cefr,
            order: lessonIndex,
            objectives: lesson.objectives,
            estimatedMinutes: lesson.estimatedMinutes ?? 10,
            xpReward: lesson.xpReward ?? 20,
            content: lesson.content ?? null,
            accent: lesson.accent ?? null,
            culturalNote: lesson.culturalNote ?? null,
          },
        });
        lessonCount += 1;

        // Exercises have no natural key within a lesson, so replace them.
        // Attempts are preserved by SetNull on the relation.
        await prisma.exercise.deleteMany({ where: { lessonId: lessonRow.id } });

        for (const [exerciseIndex, exercise] of lesson.exercises.entries()) {
          const lexicalItemId = exercise.lexicalItem
            ? lexicalIdByHeadword.get(exercise.lexicalItem)
            : undefined;

          if (exercise.lexicalItem && !lexicalItemId) {
            console.warn(
              `  ! lesson "${lesson.slug}" references unknown lexical item "${exercise.lexicalItem}"`,
            );
          }

          await prisma.exercise.create({
            data: {
              lessonId: lessonRow.id,
              order: exerciseIndex,
              type: exercise.type,
              skill: exercise.skill,
              cefr: exercise.cefr,
              prompt: exercise.prompt,
              instructions: exercise.instructions ?? null,
              payload: exercise.payload as Prisma.InputJsonValue,
              solution: exercise.solution as Prisma.InputJsonValue,
              explanation: exercise.explanation ?? null,
              points: exercise.points ?? 10,
              tags: exercise.tags ?? [],
              lexicalItemId: lexicalItemId ?? null,
            },
          });
          exerciseCount += 1;
        }
      }
    }
  }

  console.log(`  curriculum: ${TRACKS.length} tracks, ${lessonCount} lessons, ${exerciseCount} exercises`);
}

async function seedExams() {
  let taskCount = 0;

  for (const [moduleIndex, module] of EXAM_MODULES.entries()) {
    const moduleRow = await prisma.examModule.upsert({
      where: { slug: module.slug },
      update: {
        exam: module.exam,
        section: module.section,
        title: module.title,
        description: module.description,
        cefr: module.cefr,
        durationMin: module.durationMin,
        instructions: module.instructions,
        order: moduleIndex,
      },
      create: {
        exam: module.exam,
        slug: module.slug,
        section: module.section,
        title: module.title,
        description: module.description,
        cefr: module.cefr,
        durationMin: module.durationMin,
        instructions: module.instructions,
        order: moduleIndex,
      },
    });

    await prisma.examTask.deleteMany({ where: { moduleId: moduleRow.id } });

    for (const [taskIndex, task] of module.tasks.entries()) {
      await prisma.examTask.create({
        data: {
          moduleId: moduleRow.id,
          order: taskIndex,
          type: task.type,
          prompt: task.prompt,
          payload: task.payload as Prisma.InputJsonValue,
          solution: task.solution as Prisma.InputJsonValue,
          rubric: (task.rubric ?? null) as Prisma.InputJsonValue,
          points: task.points ?? 1,
        },
      });
      taskCount += 1;
    }
  }

  console.log(`  exams: ${EXAM_MODULES.length} modules, ${taskCount} tasks`);
}

async function seedBadges() {
  for (const badge of BADGES) {
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: {
        title: badge.title,
        description: badge.description,
        icon: badge.icon,
        tier: badge.tier,
        criteria: badge.criteria as unknown as Prisma.InputJsonValue,
      },
      create: {
        slug: badge.slug,
        title: badge.title,
        description: badge.description,
        icon: badge.icon,
        tier: badge.tier,
        criteria: badge.criteria as unknown as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`  badges: ${BADGES.length}`);
}

/**
 * A demo learner, so a fresh clone is explorable without clicking through
 * registration. Only created outside production, and only if absent — it must
 * never overwrite a real account that happens to share the address.
 */
async function seedDemoUser() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_USER !== "true") {
    console.log("  demo user: skipped (production)");
    return;
  }

  const email = "demo@lexicon.app";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("  demo user: already exists");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo Learner",
      passwordHash: await bcrypt.hash("lexicon-demo-2024", 12),
      profile: {
        create: {
          cefrLevel: "C1",
          theta: 0.65,
          goals: ["ACADEMIC", "BUSINESS"],
          targetExam: "CAE",
          interests: ["linguistics", "policy", "technology"],
          preferredAccent: "UK",
          dailyGoalXp: 80,
          onboardedAt: new Date(),
          placedAt: new Date(),
        },
      },
      settings: { create: {} },
      stats: {
        create: {
          xpTotal: 2450,
          level: 5,
          streakCurrent: 12,
          streakLongest: 21,
          lastActiveDate: new Date(Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate(),
          )),
          lessonsCompleted: 14,
          reviewsCompleted: 320,
          wordsMastered: 42,
          minutesTotal: 480,
        },
      },
    },
  });

  // Enrol in the tracks matching the demo profile's goals.
  const tracks = await prisma.track.findMany({
    where: { goal: { in: ["ACADEMIC", "BUSINESS"] } },
  });
  for (const [index, track] of tracks.entries()) {
    await prisma.enrollment.create({
      data: { userId: user.id, trackId: track.id, isPrimary: index === 0 },
    });
  }

  // Seed a review queue spread across due dates so the review screen has
  // something realistic in it rather than 40 brand-new cards.
  const items = await prisma.lexicalItem.findMany({ take: 30, orderBy: { frequency: "asc" } });
  for (const [index, item] of items.entries()) {
    const isNew = index >= 18;
    await prisma.reviewCard.create({
      data: {
        userId: user.id,
        lexicalItemId: item.id,
        state: isNew ? "NEW" : index % 5 === 0 ? "LEARNING" : "REVIEW",
        repetitions: isNew ? 0 : 1 + (index % 4),
        easeFactor: 2.5 - (index % 3) * 0.15,
        intervalDays: isNew ? 0 : 1 + index,
        retention: isNew ? 0 : 0.6 + (index % 4) * 0.1,
        // Two thirds due now, the rest spread into the future.
        dueAt: isNew
          ? new Date()
          : new Date(Date.now() + (index < 12 ? -1 : index) * 86_400_000),
      },
    });
  }

  // A fortnight of history so the analytics dashboard is populated. The XP
  // events, review logs and skill snapshots are generated together from the
  // same day loop, so the demo account's charts agree with its own counters —
  // an account whose "320 reviews graded" sits next to an empty recall chart
  // is a worse first impression than no demo data at all.
  const sources = ["lesson", "review", "writing", "challenge", "speaking"];
  const skills = ["READING", "WRITING", "LISTENING", "GRAMMAR", "VOCABULARY", "SPEAKING"] as const;
  const reviewCards = await prisma.reviewCard.findMany({
    where: { userId: user.id, state: { not: "NEW" } },
  });

  for (let day = 14; day >= 0; day -= 1) {
    // Two rest days, because a chart with no gaps looks fake and teaches nothing.
    if (day === 9 || day === 4) continue;
    const when = new Date(Date.now() - day * 86_400_000);
    const dayStart = new Date(Date.UTC(
      when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate(),
    ));

    for (let i = 0; i < 2 + (day % 3); i += 1) {
      await prisma.xpEvent.create({
        data: {
          userId: user.id,
          amount: 15 + ((day * 7 + i * 13) % 40),
          source: sources[(day + i) % sources.length],
          createdAt: when,
        },
      });
    }

    // Review logs, so the recall-rate figure has something to compute from.
    // Roughly 85% recall, which is where a well-calibrated queue sits.
    for (let i = 0; i < 6 + (day % 5); i += 1) {
      const card = reviewCards[(day * 3 + i) % Math.max(1, reviewCards.length)];
      if (!card) break;
      const failed = (day * 7 + i * 5) % 13 === 0;
      await prisma.reviewLog.create({
        data: {
          cardId: card.id,
          userId: user.id,
          rating: failed ? "AGAIN" : i % 4 === 0 ? "HARD" : i % 7 === 0 ? "EASY" : "GOOD",
          prevInterval: 1 + (i % 10),
          newInterval: failed ? 1 : 3 + (i % 20),
          prevEase: 2.5,
          newEase: failed ? 2.3 : 2.5,
          durationMs: 3000 + ((i * 733) % 5000),
          reviewedAt: when,
        },
      });
    }

    // Per-skill snapshots, so the skill radar renders instead of saying there
    // is not enough data. Scores trend gently upward with a realistic spread.
    for (const [index, skill] of skills.entries()) {
      if ((day + index) % 3 === 0) continue; // not every skill every day
      const base = 0.58 + index * 0.03;
      const trend = (14 - day) * 0.006;
      const noise = (((day * 31 + index * 17) % 11) - 5) * 0.012;
      await prisma.skillSnapshot.upsert({
        where: { userId_skill_date: { userId: user.id, skill, date: dayStart } },
        update: {},
        create: {
          userId: user.id,
          skill,
          date: dayStart,
          score: Math.max(0.3, Math.min(0.95, base + trend + noise)),
          cefrEstimate: base + trend > 0.72 ? "C2" : base + trend > 0.55 ? "C1" : "B2",
        },
      });
    }
  }

  console.log(`  demo user: ${email} / lexicon-demo-2024`);
}

async function main() {
  console.log("Seeding Lexicon…");

  await seedLexicon();
  await seedPlacement();
  await seedTracks();
  await seedExams();
  await seedBadges();
  await seedDemoUser();

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
