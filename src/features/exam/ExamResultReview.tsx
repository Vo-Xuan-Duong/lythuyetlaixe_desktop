import { useMemo } from "react";
import type { ExamResult, ExamSession } from "../../domain/entities/exam";

interface ExamResultReviewProps {
  session: ExamSession;
  result: ExamResult;
}

export function ExamResultReview({ session, result }: ExamResultReviewProps) {
  const resultByQuestion = useMemo(
    () => new Map(result.answers.map((answer) => [answer.questionId, answer])),
    [result.answers],
  );

  return (
    <section className="exam-review-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Review bài thi</span>
          <h2>Chi tiết từng câu</h2>
        </div>
        <span className="exam-review-summary">{result.correctCount}/{result.questionCount} câu đúng</span>
      </div>

      <div className="exam-review-list">
        {session.questions.map((item, index) => {
          const question = item.question;
          const answerResult = resultByQuestion.get(question.id);
          const selectedKey = answerResult?.selectedAnswerKey;
          const correctKey = answerResult?.correctAnswerKey;
          const status = answerResult?.correct ? "correct" : selectedKey ? "wrong" : "unanswered";

          return (
            <article className={`exam-review-item ${status}`} key={question.id}>
              <div className="exam-review-item-heading">
                <div>
                  <strong>Câu {index + 1}</strong>
                  <span>#{question.id}</span>
                  {answerResult?.critical && <span className="critical-tag">Điểm liệt</span>}
                </div>
                <strong className="exam-review-status">
                  {status === "correct" ? "Đúng" : status === "wrong" ? "Sai" : "Chưa trả lời"}
                </strong>
              </div>

              <h3>{question.content}</h3>
              {question.imagePath && (
                <div className="question-image-frame">
                  <img src={question.imagePath} alt={`Hình minh họa câu ${question.id}`} />
                </div>
              )}

              <div className="exam-review-answers">
                {question.answers.map((answer) => {
                  const selected = answer.key === selectedKey;
                  const correct = answer.key === correctKey;
                  const state = correct ? "correct" : selected ? "wrong" : "";
                  return (
                    <div className={`exam-review-answer ${state}`} key={answer.key}>
                      <span className="answer-key">{answer.key}</span>
                      <span>{answer.content}</span>
                      <span className="exam-review-answer-label">
                        {correct ? "Đáp án đúng" : selected ? "Bạn chọn" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              {question.explanation && (
                <div className="exam-review-explanation">
                  <strong>Giải thích</strong>
                  <p>{question.explanation}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
