const questions = window.QUESTIONS || [];
const storageKey = "mln111-starred-questions";

let order = questions.map((_, index) => index);
let currentPosition = 0;
let selectedLetter = null;
let reviewMode = false;
let starred = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));

const elements = {
  answerBox: document.getElementById("answerBox"),
  jumpButton: document.getElementById("jumpButton"),
  jumpInput: document.getElementById("jumpInput"),
  nextButton: document.getElementById("nextButton"),
  options: document.getElementById("options"),
  positionText: document.getElementById("positionText"),
  prevButton: document.getElementById("prevButton"),
  questionNumber: document.getElementById("questionNumber"),
  questionText: document.getElementById("questionText"),
  reviewButton: document.getElementById("reviewButton"),
  shuffleButton: document.getElementById("shuffleButton"),
  starButton: document.getElementById("starButton"),
  starCountText: document.getElementById("starCountText"),
  unshuffleButton: document.getElementById("unshuffleButton"),
};

function saveStars() {
  localStorage.setItem(storageKey, JSON.stringify([...starred]));
}

function getVisibleOrder() {
  if (!reviewMode) return order;
  return order.filter((index) => starred.has(questions[index].number));
}

function getCurrentQuestion() {
  const visibleOrder = getVisibleOrder();
  return questions[visibleOrder[currentPosition]];
}

function correctOptions(question) {
  return question.options.filter((option) => option.isCorrect);
}

function render() {
  const visibleOrder = getVisibleOrder();

  if (!visibleOrder.length) {
    elements.questionNumber.textContent = "No starred questions yet";
    elements.questionText.textContent = "Star questions you want to review, then come back here.";
    elements.options.replaceChildren();
    elements.answerBox.hidden = true;
    elements.positionText.textContent = "0 / 0";
    elements.starButton.textContent = "☆ Star";
    elements.starButton.classList.remove("starred");
    elements.starCountText.textContent = `${starred.size} starred`;
    return;
  }

  currentPosition = Math.max(0, Math.min(currentPosition, visibleOrder.length - 1));
  const question = getCurrentQuestion();
  const isStarred = starred.has(question.number);

  elements.positionText.textContent = `Showing ${currentPosition + 1} / ${visibleOrder.length}`;
  elements.starCountText.textContent = `${starred.size} starred`;
  elements.questionNumber.textContent = `Question ${question.number}`;
  elements.questionText.textContent = question.question;
  elements.jumpInput.max = questions.length;
  elements.jumpInput.value = question.number;
  elements.reviewButton.classList.toggle("active", reviewMode);
  elements.reviewButton.textContent = reviewMode ? "All questions" : "Review starred";
  elements.starButton.classList.toggle("starred", isStarred);
  elements.starButton.textContent = isStarred ? "★ Starred" : "☆ Star";
  renderOptions(question);
  renderAnswer(question);
}

function renderOptions(question) {
  elements.options.replaceChildren();

  if (!question.options.length) {
    const empty = document.createElement("p");
    empty.textContent = "No answer choices were found for this question.";
    elements.options.append(empty);
    return;
  }

  for (const option of question.options) {
    const button = document.createElement("button");
    button.className = "option";
    button.type = "button";
    button.dataset.letter = option.letter;

    if (selectedLetter) {
      if (option.isCorrect) button.classList.add("correct");
      if (selectedLetter === option.letter && !option.isCorrect) button.classList.add("wrong");
    }

    const letter = document.createElement("span");
    letter.className = "letter";
    letter.textContent = option.letter;

    const text = document.createElement("span");
    text.textContent = option.text;

    button.append(letter, text);
    button.addEventListener("click", () => {
      selectedLetter = option.letter;
      render();
    });
    elements.options.append(button);
  }
}

function renderAnswer(question) {
  if (!selectedLetter) {
    elements.answerBox.hidden = true;
    elements.answerBox.textContent = "";
    return;
  }

  const correct = correctOptions(question);
  elements.answerBox.hidden = false;

  if (!correct.length) {
    elements.answerBox.textContent = "No bold answer was marked in the source document.";
    return;
  }

  const selected = question.options.find((option) => option.letter === selectedLetter);
  const correctText = correct
    .map((option) => `${option.letter}. ${option.text}`)
    .join(" | ");
  const isRight = selected && selected.isCorrect;

  elements.answerBox.innerHTML = `${
    isRight ? "Correct." : "Not this one."
  } Answer: <strong>${escapeHtml(correctText)}</strong>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function goToPosition(position) {
  currentPosition = position;
  selectedLetter = null;
  render();
}

function jumpToQuestionNumber() {
  const requested = Number(elements.jumpInput.value);
  const visibleOrder = getVisibleOrder();
  const position = visibleOrder.findIndex((index) => questions[index].number === requested);

  if (position >= 0) {
    goToPosition(position);
    return;
  }

  const allPosition = questions.findIndex((question) => question.number === requested);
  if (allPosition >= 0) {
    reviewMode = false;
    goToPosition(order.indexOf(allPosition));
  }
}

function shuffleOrder() {
  const shuffled = [...order];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  order = shuffled;
  goToPosition(0);
}

function unshuffleOrder() {
  const currentQuestion = getCurrentQuestion();
  order = questions.map((_, index) => index);
  const visibleOrder = getVisibleOrder();
  const restoredPosition = currentQuestion
    ? visibleOrder.findIndex((index) => questions[index].number === currentQuestion.number)
    : 0;

  goToPosition(restoredPosition >= 0 ? restoredPosition : 0);
}

function toggleCurrentStar() {
  const question = getCurrentQuestion();
  if (!question) return;

  if (starred.has(question.number)) {
    starred.delete(question.number);
  } else {
    starred.add(question.number);
  }

  saveStars();
  render();
}

function isTypingTarget(target) {
  return target.closest("input, textarea, select");
}

elements.prevButton.addEventListener("click", () => goToPosition(currentPosition - 1));
elements.nextButton.addEventListener("click", () => goToPosition(currentPosition + 1));
elements.jumpButton.addEventListener("click", jumpToQuestionNumber);
elements.jumpInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") jumpToQuestionNumber();
});
elements.shuffleButton.addEventListener("click", shuffleOrder);
elements.unshuffleButton.addEventListener("click", unshuffleOrder);
elements.reviewButton.addEventListener("click", () => {
  reviewMode = !reviewMode;
  goToPosition(0);
});
elements.starButton.addEventListener("click", toggleCurrentStar);
document.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;

  if (event.code === "Space") {
    event.preventDefault();
    goToPosition(currentPosition + 1);
  } else if (event.key.toLowerCase() === "a") {
    event.preventDefault();
    goToPosition(currentPosition - 1);
  } else if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    toggleCurrentStar();
  }
});

render();
