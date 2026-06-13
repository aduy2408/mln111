const fs = require("fs");
const zlib = require("zlib");

const source = "src.MLN111.docx";
const output = "questions.js";

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\u00a0/g, " ");
}

function getDocumentXml() {
  const archive = fs.readFileSync(source);
  const target = Buffer.from("word/document.xml");
  let offset = 0;

  while (offset < archive.length - 30) {
    if (archive.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const fileNameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = archive.subarray(nameStart, nameEnd);

    if (fileName.equals(target)) {
      const compressed = archive.subarray(dataStart, dataEnd);
      if (method === 0) return compressed.toString("utf8");
      if (method === 8) return zlib.inflateRawSync(compressed).toString("utf8");
      throw new Error(`Unsupported zip compression method: ${method}`);
    }

    offset = dataEnd || offset + 1;
    if (uncompressedSize === 0 && compressedSize === 0) offset += 1;
  }

  throw new Error("Could not find word/document.xml in the DOCX.");
}

function extractParagraphs(xml) {
  const paragraphs = [];

  for (const paragraphMatch of xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)) {
    const paragraph = paragraphMatch[0];
    let text = "";
    let bold = false;

    for (const runMatch of paragraph.matchAll(/<w:r[\s\S]*?<\/w:r>/g)) {
      const run = runMatch[0];
      const runIsBold =
        /<w:b(?:\s|\/|>)/.test(run) &&
        !/<w:b[^>]*w:val="(?:0|false)"/.test(run);
      let runText = "";

      for (const textMatch of run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
        runText += decodeXml(textMatch[1]);
      }

      if (runText) {
        text += runText;
        bold = bold || runIsBold;
      }
    }

    text = text.replace(/\s+/g, " ").trim();
    if (text) paragraphs.push({ text, bold });
  }

  return paragraphs;
}

function groupQuestions(paragraphs) {
  const grouped = [];
  let current = null;

  for (const paragraph of paragraphs) {
    const marker = paragraph.text.match(/^(\d+)\.\s*$/);
    if (marker) {
      if (current) grouped.push(current);
      current = { number: Number(marker[1]), lines: [] };
      continue;
    }

    if (current) current.lines.push(paragraph);
  }

  if (current) grouped.push(current);
  return grouped;
}

function parseQuestions(grouped) {
  const questions = grouped.map((question) => {
    const questionLines = [];
    const options = [];
    let activeOption = null;

    for (const line of question.lines) {
      if (/^MLN111\s*:/.test(line.text)) continue;

      const optionMatch = line.text.match(
        /^([A-Da-d])(?:\s*[\.)]\s*|\s+(?!là\b))(.+)$/i,
      );
      if (optionMatch) {
        const letter = optionMatch[1].toUpperCase();
        if (!options.length && letter !== "A") {
          questionLines.push(line.text);
          continue;
        }

        if (letter === "A" && options.length >= 4) {
          options.length = 0;
        }

        activeOption = {
          letter,
          text: optionMatch[2],
          isCorrect: line.bold,
        };
        options.push(activeOption);
        continue;
      }

      if (activeOption && options.length < 4) {
        activeOption.text += ` ${line.text}`;
        activeOption.isCorrect = activeOption.isCorrect || line.bold;
      } else {
        questionLines.push(line.text);
      }
    }

    return {
      number: question.number,
      question: questionLines.join("\n"),
      options,
    };
  });

  return moveLeadingNotesToPreviousQuestion(questions);
}

function splitLeadingParenthetical(text) {
  if (!text.startsWith("(")) return null;

  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (depth === 0) {
      const note = text.slice(0, index + 1).trim();
      const rest = text.slice(index + 1).replace(/^\s+/, "");
      if (!note || !rest) return null;
      return { note, rest };
    }
  }

  return null;
}

function moveLeadingNotesToPreviousQuestion(questions) {
  for (let index = 1; index < questions.length; index += 1) {
    const split = splitLeadingParenthetical(questions[index].question);
    if (!split) {
      moveLeadingNoteSplitFromOption(questions, index);
      continue;
    }

    questions[index - 1].question = `${questions[index - 1].question}\n${split.note}`;
    questions[index].question = split.rest;
  }

  return questions;
}

function moveLeadingNoteSplitFromOption(questions, index) {
  const question = questions[index];
  if (!question.question.startsWith("(")) return;

  const splitOptionIndex = question.options.findIndex((option) =>
    /\)\s+\p{Lu}/u.test(option.text),
  );
  if (splitOptionIndex < 0) return;

  const option = question.options[splitOptionIndex];
  const closeIndex = option.text.search(/\)\s+\p{Lu}/u);
  const noteOptionText = option.text.slice(0, closeIndex + 1).trim();
  const rest = option.text.slice(closeIndex + 1).trim();
  const noteOptions = question.options
    .slice(0, splitOptionIndex)
    .map((noteOption) => `${noteOption.letter}. ${noteOption.text}`);
  const note = [
    question.question,
    ...noteOptions,
    `${option.letter}. ${noteOptionText}`,
  ].join("\n");

  questions[index - 1].question = `${questions[index - 1].question}\n${note}`;
  question.question = rest;
  question.options = question.options.slice(splitOptionIndex + 1);
}

const questions = parseQuestions(groupQuestions(extractParagraphs(getDocumentXml())));
const invalid = questions.filter((question) => {
  const correct = question.options.filter((option) => option.isCorrect);
  return question.options.length === 0 || correct.length === 0 || !question.question;
});

fs.writeFileSync(
  output,
  `window.QUESTIONS = ${JSON.stringify(questions, null, 2)};\n`,
  "utf8",
);

console.log(`Extracted ${questions.length} questions to ${output}`);
if (invalid.length) {
  console.warn(
    `Warning: check ${invalid.length} question(s): ${invalid
      .slice(0, 20)
      .map((question) => question.number)
      .join(", ")}`,
  );
}
