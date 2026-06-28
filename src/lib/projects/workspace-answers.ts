import {
  type BriefQuestion,
  type ProjectBriefPatch,
  type WorkspaceCard,
  isBriefQuestionId,
} from "@/lib/projects/brief";

export type WorkspaceAnswerPayload = {
  answer: string;
  question?: string;
  questionId: BriefQuestion["id"];
  source?: "custom" | "option";
};

export function buildBriefPatchFromWorkspaceAnswers({
  card,
  fallbackText,
  workspaceAnswers,
}: {
  card: WorkspaceCard;
  fallbackText: string;
  workspaceAnswers: unknown;
}): ProjectBriefPatch {
  if (card.type !== "question") {
    return {};
  }

  const questions = [card.question];
  const answers = parseWorkspaceAnswers(workspaceAnswers);
  const normalizedAnswers = answers.length
    ? answers
    : parseFormattedWorkspaceAnswers(fallbackText, questions);

  if (!normalizedAnswers.length) {
    return {};
  }

  const activeQuestions = new Map(
    questions.map((question) => [question.id, question]),
  );
  const patch: ProjectBriefPatch = {};

  for (const answer of normalizedAnswers) {
    const question = activeQuestions.get(answer.questionId);

    if (!question) {
      continue;
    }

    const value = normalizeAnswer(answer.answer);

    if (!value) {
      continue;
    }

    patch[answer.questionId] = value;
  }

  return patch;
}

function parseWorkspaceAnswers(value: unknown): WorkspaceAnswerPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const answers: WorkspaceAnswerPayload[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const input = item as Partial<WorkspaceAnswerPayload>;

    if (!isBriefQuestionId(input.questionId)) {
      continue;
    }

    const answer = normalizeAnswer(input.answer);

    if (!answer) {
      continue;
    }

    answers.push({
      answer,
      question: normalizeAnswer(input.question) || undefined,
      questionId: input.questionId,
      source: input.source === "custom" ? "custom" : "option",
    });
  }

  return answers.slice(0, 1);
}

function parseFormattedWorkspaceAnswers(
  text: string,
  questions: BriefQuestion[],
): WorkspaceAnswerPayload[] {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return [];
  }

  const blocks = normalizedText
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const answers: WorkspaceAnswerPayload[] = [];

  for (const [index, block] of blocks.entries()) {
    const match = block.match(
      /^\s*(\d+)\.\s*(.*?)\s*\n\s*Jawaban:\s*([\s\S]+)$/i,
    );
    const question = questions[index];

    if (!match || !question) {
      continue;
    }

    const questionText = normalizeAnswer(match[2]);
    const storedQuestionText = normalizeAnswer(question.question);

    if (
      questionText &&
      storedQuestionText &&
      questionText !== storedQuestionText &&
      !questionTextLooksLikeField(questionText, question.id)
    ) {
      continue;
    }

    answers.push({
      answer: normalizeAnswer(match[3]),
      question: storedQuestionText,
      questionId: question.id,
      source: "custom",
    });
  }

  if (
    !answers.length &&
    questions.length === 1 &&
    !/^\s*\d+\./m.test(normalizedText)
  ) {
    const answer = normalizedText.match(/Jawaban:\s*([\s\S]+)$/i)?.[1];

    if (answer) {
      answers.push({
        answer: normalizeAnswer(answer),
        question: normalizeAnswer(questions[0].question),
        questionId: questions[0].id,
        source: "custom",
      });
    }
  }

  return answers.filter((answer) => answer.answer).slice(0, 3);
}

function questionTextLooksLikeField(
  questionText: string,
  field: BriefQuestion["id"],
) {
  const patterns: Record<BriefQuestion["id"], RegExp> = {
    businessType: /(jenis|bidang).*(usaha|bisnis)|bisnis apa|usaha apa/i,
    contactOrCta: /(whatsapp|kontak|pesan|hubungi|order|aksi|cta)/i,
    offer: /(produk|jasa|menu|layanan|tawaran|jual)/i,
    stylePreference: /(gaya|visual|warna|tampilan|desain|nuansa)/i,
    targetCustomer: /(target|pelanggan|pembeli|customer|siapa)/i,
  };

  return patterns[field].test(questionText);
}

function normalizeAnswer(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 280)
    : "";
}
