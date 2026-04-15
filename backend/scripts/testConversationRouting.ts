import assert from "node:assert/strict";
import { planShortConversationMemory } from "../src/services/ragService.ts";
import { classifyStudentAiIntent } from "../src/services/studentAiQuestionRouter.ts";

function run(): void {
  assert.equal(classifyStudentAiIntent("AMU是什么学校"), "school_fact");
  assert.equal(classifyStudentAiIntent("我在AMU能上他们的课么"), "general");

  const memoryPlan = planShortConversationMemory(
    "我在AMU能上他们的课么",
    [
      { role: "user", content: "这三个人谁最厉害" },
      {
        role: "assistant",
        content:
          "如果你说的是孙子、亚里士多德和凯撒，他们都很厉害，但属于不同领域的历史人物。",
      },
    ],
    classifyStudentAiIntent("我在AMU能上他们的课么"),
  );

  assert.equal(memoryPlan.isFollowUp, true);
  assert.equal(memoryPlan.isTopicSwitch, false);
  assert.equal(memoryPlan.effectiveIntent, "general");
  assert.equal(memoryPlan.history?.length, 2);

  console.log("conversation routing checks passed");
}

run();
